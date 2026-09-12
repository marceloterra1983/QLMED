#!/usr/bin/env bash
# Remote half of QLMED production deploy.
#
# The GitHub runner (`qlmed-prod`) stays on `server` and builds the image.
# This script is the only path that mutates the writer (QLMED_DEPLOY_HOST=vps2):
# load image, compose stop/migrate/up, health on 127.0.0.1:13000, outbox cron.
set -euo pipefail

HOST="${QLMED_DEPLOY_HOST:?QLMED_DEPLOY_HOST is unset (expected vps2)}"
PROD="${QLMED_PROD_DIR:-/home/marce/qlmed/production}"
SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=30 -o ServerAliveInterval=15 -o ServerAliveCountMax=8)

ssh_writer() {
  ssh "${SSH_OPTS[@]}" "$HOST" "$@"
}

rsync_writer() {
  rsync -e "ssh ${SSH_OPTS[*]}" "$@"
}

usage() {
  cat <<'EOF' >&2
Usage: QLMED_DEPLOY_HOST=vps2 scripts/qlmed-deploy-vps2.sh <command>

Commands:
  ping
  capture-rollback
  load-image <image:tag>
  release
  health [attempts]
  verify-revision <sha>
  tag-previous
  rmi-rollback
  rollback
  install-outbox
EOF
}

cmd="${1:-}"
if [[ -z "$cmd" || "$cmd" == "-h" || "$cmd" == "--help" ]]; then
  usage
  exit 2
fi
shift

case "$cmd" in
  ping)
    ssh_writer "hostname; test -f ${PROD}/docker-compose.yml; test -f ${PROD}/.env"
    ;;

  capture-rollback)
    if ssh_writer 'docker inspect qlmed-app >/dev/null 2>&1'; then
      run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID is unset}"
      ssh_writer "set -euo pipefail
        current_image=\$(docker inspect qlmed-app --format '{{.Image}}')
        docker tag \"\$current_image\" \"qlmed-app:rollback-${run_id}\"
        docker tag \"\$current_image\" qlmed-app:previous"
      if [[ -n "${GITHUB_ENV:-}" ]]; then
        echo "ROLLBACK_IMAGE_AVAILABLE=1" >> "$GITHUB_ENV"
      fi
    fi
    ;;

  load-image)
    tag="${1:?image tag (qlmed-app:<sha>)}"
    safe="$(printf '%s' "${tag##*:}" | tr -c 'a-fA-F0-9' '_')"
    tmp="/var/tmp/qlmed-app-${safe}.tar.gz"
    docker save "$tag" | gzip -1 > "$tmp"
    rsync_writer -a "$tmp" "${HOST}:/var/tmp/"
    remote_tmp="/var/tmp/qlmed-app-${safe}.tar.gz"
    ssh_writer "set -euo pipefail; gunzip -c $(printf '%q' "$remote_tmp") | docker load; rm -f $(printf '%q' "$remote_tmp")"
    rm -f "$tmp"
    ;;

  release)
    run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID is unset}"
    rollback_available="${ROLLBACK_IMAGE_AVAILABLE:-0}"
    ssh_writer "ROLLBACK_AVAILABLE=$(printf '%q' "$rollback_available") RUN_ID=$(printf '%q' "$run_id") PROD=$(printf '%q' "$PROD") bash -s" <<'EOS'
set -euo pipefail
set -a
# shellcheck disable=SC1091
. "$PROD/.deploy-meta.env"
# shellcheck disable=SC1091
. "$PROD/.env"
set +a
compose=(docker compose --project-name qlmed --env-file "$PROD/.env" -f "$PROD/docker-compose.yml")
restore_previous() {
  if [[ "${ROLLBACK_AVAILABLE}" == "1" ]]; then
    QLMED_BUILD_COMMIT_SHA="rollback-${RUN_ID}" \
      "${compose[@]}" up -d --no-build --force-recreate qlmed-app
  fi
}
trap restore_previous ERR
"${compose[@]}" stop qlmed-app
"${compose[@]}" run --rm --no-deps qlmed-app sh -c '
  set -eu
  state=/tmp/qlmed-production-migration-window.json
  node scripts/verify-production-migration-window.cjs before "$state"
  node node_modules/prisma/build/index.js migrate deploy
  node node_modules/prisma/build/index.js migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
  node scripts/verify-production-migration-window.cjs after "$state"
'
"${compose[@]}" up -d --no-build qlmed-app
trap - ERR
EOS
    ;;

  health)
    attempts="${1:-30}"
    url="http://127.0.0.1:13000/api/health"
    for attempt in $(seq 1 "$attempts"); do
      if ssh_writer "curl -fsS $(printf '%q' "$url") >/dev/null"; then
        exit 0
      fi
      if [[ "$attempt" -eq "$attempts" ]]; then
        echo "Health check failed for ${url} on ${HOST}" >&2
        exit 1
      fi
      sleep 2
    done
    ;;

  verify-revision)
    expected_sha="${1:?full 40-char sha}"
    expected_id="$(docker image inspect "qlmed-app:${expected_sha}" --format '{{.Id}}')"
    remote_id="$(ssh_writer "docker image inspect qlmed-app:${expected_sha} --format '{{.Id}}'")"
    if [[ "$expected_id" != "$remote_id" ]]; then
      echo "Loaded image id mismatch: runner ${expected_id} writer ${remote_id}" >&2
      exit 1
    fi
    for attempt in $(seq 1 30); do
      running_id="$(ssh_writer "docker inspect qlmed-app --format '{{.Image}}'" || true)"
      running_tag="$(ssh_writer "docker inspect qlmed-app --format '{{.Config.Image}}'" || true)"
      if [[ "$running_id" == "$expected_id" && "$running_tag" == "qlmed-app:${expected_sha}" ]]; then
        echo "Deployed revision verified on ${HOST}: ${running_tag} (${running_id})"
        exit 0
      fi
      if [[ "$attempt" -eq 30 ]]; then
        echo "Revision check failed on ${HOST}: expected qlmed-app:${expected_sha} (${expected_id}), running ${running_tag:-none} (${running_id:-none})" >&2
        exit 1
      fi
      sleep 2
    done
    ;;

  tag-previous)
    run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID is unset}"
    ssh_writer "set -euo pipefail
      docker image inspect qlmed-app:rollback-${run_id} >/dev/null
      docker tag qlmed-app:rollback-${run_id} qlmed-app:previous
      docker image inspect qlmed-app:previous >/dev/null"
    ;;

  rmi-rollback)
    run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID is unset}"
    ssh_writer "docker rmi qlmed-app:rollback-${run_id} >/dev/null 2>&1 || true"
    ;;

  rollback)
    run_id="${GITHUB_RUN_ID:?GITHUB_RUN_ID is unset}"
    ssh_writer "PROD=$(printf '%q' "$PROD") RUN_ID=$(printf '%q' "$run_id") bash -s" <<'EOS'
set -euo pipefail
set -a
# shellcheck disable=SC1091
. "$PROD/.env"
set +a
QLMED_BUILD_COMMIT_SHA="rollback-${RUN_ID}" docker compose \
  --project-name qlmed \
  --env-file "$PROD/.env" \
  -f "$PROD/docker-compose.yml" \
  up -d --no-build --force-recreate qlmed-app
EOS
    for _ in $(seq 1 60); do
      if ssh_writer 'curl -fsS http://127.0.0.1:13000/api/health >/dev/null'; then
        exit 0
      fi
      sleep 2
    done
    echo "Rollback health check failed on ${HOST}" >&2
    exit 1
    ;;

  install-outbox)
    ssh_writer "sudo -n -u marce -- /usr/bin/bash /usr/local/lib/qlmed/install-notification-outbox-cron.sh ${PROD}/app/scripts/notification-outbox-worker.py"
    ;;

  *)
    echo "Unknown command: ${cmd}" >&2
    usage
    exit 2
    ;;
esac
