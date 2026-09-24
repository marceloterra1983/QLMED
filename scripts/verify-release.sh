#!/usr/bin/env bash
set -euo pipefail

readonly QLMED_RELEASE_CONTAINER="github-runner-qlmed-ci-linux-01-runner-linux-1"

qlmed_refuse_release() {
  echo "Refusing: $*" >&2
  return 1
}

# Tests may define this function before sourcing the script. In normal use, it
# documents and performs the required worker check inside the fixed container:
# docker exec <container> pgrep -a Runner.Worker
qlmed_runner_busy_is_default=0
if ! declare -F qlmed_runner_busy >/dev/null; then
  qlmed_runner_busy() {
    docker exec "$QLMED_RELEASE_CONTAINER" pgrep -a Runner.Worker
  }
  qlmed_runner_busy_is_default=1
fi

qlmed_verify_inside() {
  local runner_name="${RUNNER_NAME:-}"
  local database_url="${DATABASE_URL:-}"

  if [[ ! "$runner_name" =~ ^qlmed-ci-linux-[0-9]{2}$ ]]; then
    qlmed_refuse_release "RUNNER_NAME must match qlmed-ci-linux-NN"
    return 1
  fi

  if [[ -z "$database_url" ]]; then
    qlmed_refuse_release "DATABASE_URL is required"
    return 1
  fi

  if [[ "$database_url" == *"127.0.0.1:5433"* ]]; then
    qlmed_refuse_release "DATABASE_URL must not use 127.0.0.1:5433"
    return 1
  fi

  if [[ "$database_url" == *"127.0.0.1:5435"* ]]; then
    qlmed_refuse_release "DATABASE_URL must not use 127.0.0.1:5435"
    return 1
  fi

  if [[ "$database_url" != *"qlmed-ci-db:5432"* ]]; then
    qlmed_refuse_release "DATABASE_URL must use qlmed-ci-db:5432"
    return 1
  fi

  if [[ "$database_url" != *"/qlmed_ci"* ]]; then
    qlmed_refuse_release "DATABASE_URL must select /qlmed_ci"
    return 1
  fi

  python3 ./scripts/verify-ci-isolation.py

  if [[ "${QLMED_VERIFY_SUITE:-0}" != "1" ]]; then
    echo "INSIDE_CHECKS_OK"
    return 0
  fi

  qlmed_use_toolcache_node
  npm ci
  npm run ci:verify
  npm run db:config:verify
  npx prisma generate
  npx prisma validate
  npm run docs:validate:test
  npm run docs:validate
  npm run ai-tooling:check:test
  npm run ai-tooling:check
  node ./scripts/reset-ci-database.mjs
  bash ./scripts/verify-migrations.sh
  npm run db:reconcile:verify
  npm run typecheck
  npm run lint
  npm run ui:check
  npm test
  npm run cte:pfx:test
  npm run test:integration
  npm run build
  npm run ui:gallery:check
  npm run ui:gallery:test
  npm run audit:verify:test
  npm run audit:verify
}

qlmed_use_toolcache_node() {
  local node_bin
  node_bin="$(find /opt/hostedtoolcache/node -type f -name node 2>/dev/null | sort | tail -1 || true)"
  if [[ -z "$node_bin" ]]; then
    qlmed_refuse_release "node toolcache missing in the isolated container"
    return 1
  fi
  export PATH="$(dirname "$node_bin"):$PATH"
}

qlmed_write_receipt() {
  local sha="$1"
  local log_file="$2"
  local receipt_dir="/home/marce/qlmed/var/release-receipts"
  local log_hash finished
  log_hash="$(sha256sum "$log_file" | awk '{print $1}')"
  finished="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  mkdir -p "$receipt_dir"
  python3 - "$receipt_dir/${sha}.json" "$sha" "$log_hash" "$finished" <<'PY'
import json
import sys
path, sha, log_hash, finished = sys.argv[1:]
with open(path, "w", encoding="utf-8") as fh:
    json.dump(
        {
            "sha": sha,
            "runner": "qlmed-ci-linux-01",
            "finishedAt": finished,
            "ok": True,
            "logSha256": log_hash,
        },
        fh,
        indent=2,
    )
    fh.write("\n")
PY
  echo "RECEIPT_WRITTEN ${receipt_dir}/${sha}.json"
}

qlmed_verify_host() {
  local sha="${1:-}"
  local worker_output=""
  local worker_status=0

  if [[ ! "$sha" =~ ^[0-9a-f]{40}$ ]]; then
    qlmed_refuse_release "SHA must be exactly 40 lowercase hexadecimal characters"
    return 1
  fi

  if [[ "${QLMED_VERIFY_SKIP_DOCKER:-0}" == "1" ]] &&
    (( qlmed_runner_busy_is_default == 1 )); then
    worker_status=1
  else
    worker_output="$(qlmed_runner_busy 2>&1)" || worker_status=$?
  fi
  if [[ -n "$worker_output" ]]; then
    qlmed_refuse_release "Runner.Worker is active in $QLMED_RELEASE_CONTAINER: $worker_output"
    return 1
  fi
  if (( worker_status != 0 && worker_status != 1 )); then
    qlmed_refuse_release "could not inspect Runner.Worker in $QLMED_RELEASE_CONTAINER"
    return 1
  fi

  if [[ "${QLMED_VERIFY_SKIP_DOCKER:-0}" == "1" ]]; then
    echo "HOST_PREFLIGHT_OK"
    return 0
  fi

  # No host bind mount is allowed. The selected tree enters the container via
  # `git archive`, followed by `docker cp`. DATABASE_URL is the sidecar on the
  # internal network, the same URL the Actions job uses.
  local archive log_file
  archive="$(mktemp)"
  log_file="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$archive' '$log_file'" RETURN
  git archive --format=tar "$sha" >"$archive"
  chmod a+r "$archive"
  # /tmp inside this image is a tmpfs docker cp cannot see. The work mount can.
  # docker cp keeps the mode. mktemp is 0600 and the container user could not read it.
  docker exec "$QLMED_RELEASE_CONTAINER" mkdir -p /runner/_work/qlmed-release
  docker cp "$archive" "$QLMED_RELEASE_CONTAINER:/runner/_work/qlmed-release/tree.tar"
  if ! docker exec \
    -e QLMED_VERIFY_SUITE=1 \
    -e DATABASE_URL='postgresql://qlmed_ci:qlmed_ci@qlmed-ci-db:5432/qlmed_ci?schema=public' \
    -e NEXTAUTH_SECRET=ci-only-secret \
    -e NEXTAUTH_URL='http://127.0.0.1:3000' \
    -e QLMED_DISABLE_BACKGROUND_SERVICES=true \
    "$QLMED_RELEASE_CONTAINER" \
    bash -lc \
    'set -euo pipefail
     workdir=/runner/_work/qlmed-release/src
     rm -rf "$workdir"
     mkdir -p "$workdir"
     chmod a+r /runner/_work/qlmed-release/tree.tar || true
     tar -xf /runner/_work/qlmed-release/tree.tar -C "$workdir"
     cd "$workdir"
     set +e
     bash scripts/verify-release.sh --inside
     status=$?
     set -e
     rm -rf /runner/_work/qlmed-release
     exit "$status"' \
    >"$log_file" 2>&1; then
    cat "$log_file" >&2
    qlmed_refuse_release "inside gate failed"
    return 1
  fi
  cat "$log_file"
  qlmed_write_receipt "$sha" "$log_file"
}

qlmed_verify_release() {
  if [[ "${1:-}" == "--inside" ]]; then
    if (( $# != 1 )); then
      qlmed_refuse_release "--inside accepts no additional arguments"
      return 1
    fi
    qlmed_verify_inside
    return
  fi

  if (( $# != 1 )); then
    qlmed_refuse_release "host mode requires exactly one SHA argument"
    return 1
  fi
  qlmed_verify_host "$1"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then
  qlmed_verify_release "$@"
fi
