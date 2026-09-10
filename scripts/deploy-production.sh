#!/usr/bin/env bash
# Despacha QLMED Production Deploy (workflow_dispatch) com fail-closed.
#
# O token da GitHub App do Cursor Cloud Agent só tem actions:read — por isso
# `gh workflow run` devolve 403. Este script usa QLMED_DEPLOY_GH_TOKEN
# (fine-grained PAT com Actions: Read and write no repo QLMED), sem
# sobrescrever o login `gh`/`git` do agente.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-production.sh [REVISION]

Despacha .github/workflows/deploy-production.yml em refs/heads/main.

  REVISION  SHA completo (40 hex) de origin/main. Default: tip atual de origin/main.

Requer env QLMED_DEPLOY_GH_TOKEN (PAT fine-grained: Actions=RW, Contents=R no QLMED).
Não use GH_TOKEN/GITHUB_TOKEN do Cursor — eles não têm actions:write.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in git gh; do
  require_cmd "$cmd"
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if [[ -z "${QLMED_DEPLOY_GH_TOKEN:-}" ]]; then
  cat >&2 <<'EOF'
Refusing deploy: QLMED_DEPLOY_GH_TOKEN is unset.

Create a fine-grained GitHub PAT (Actions: Read and write on QLMED) and add it
as secret QLMED_DEPLOY_GH_TOKEN on the Cursor Cloud environment:
  https://cursor.com/dashboard/cloud-agents/environments
EOF
  exit 1
fi

git fetch origin main --quiet
requested="${1:-}"
if [[ -z "$requested" ]]; then
  requested="$(git rev-parse origin/main)"
fi

if ! printf '%s' "$requested" | grep -Eq '^[0-9a-f]{40}$'; then
  echo "Refusing deploy: revision must be exactly 40 lowercase hex characters (got: ${requested})" >&2
  exit 1
fi

current_main="$(git rev-parse origin/main)"
if [[ "$requested" != "$current_main" ]]; then
  echo "Refusing deploy: revision ${requested} is not current origin/main ${current_main}" >&2
  exit 1
fi

echo "Dispatching QLMED Production Deploy for ${requested}..."
dispatched_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
# Token só neste processo — não altera hosts.yml / git credential do agente.
dispatch_out="$(
  GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh workflow run deploy-production.yml \
    --ref main \
    -f confirm_production=DEPLOY \
    -f revision="$requested" 2>&1
)" || {
  echo "$dispatch_out" >&2
  exit 1
}
echo "$dispatch_out"

# Prefer run URL printed by gh (newer CLI); else poll for a LIVE run created
# at/after dispatch — never attach to an older completed success.
run_id=""
run_url="$(printf '%s\n' "$dispatch_out" | grep -Eo 'https://github.com/[^ ]+/actions/runs/[0-9]+' | tail -n1 || true)"
if [[ -n "$run_url" ]]; then
  run_id="${run_url##*/}"
fi

echo "Waiting for workflow run to appear..."
for _ in $(seq 1 45); do
  if [[ -z "$run_id" ]]; then
    mapfile -t run_fields < <(
      GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run list \
        --workflow=deploy-production.yml \
        --branch main \
        --event workflow_dispatch \
        --limit 10 \
        --json databaseId,url,status,createdAt \
      | jq -r --arg since "$dispatched_at" '
          [.[]
            | select(.createdAt >= $since)
            | select(.status == "queued" or .status == "waiting"
                     or .status == "in_progress" or .status == "requested"
                     or .status == "pending")
          ][0] | select(. != null) | .databaseId, .url
        '
    )
    if [[ "${#run_fields[@]}" -eq 2 && -n "${run_fields[0]}" ]]; then
      run_id="${run_fields[0]}"
      run_url="${run_fields[1]}"
    fi
  fi
  if [[ -n "$run_id" ]]; then
    status="$(
      GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run view "$run_id" \
        --json status --jq .status
    )"
    if [[ "$status" == "waiting" ]]; then
      cat >&2 <<EOF
Deploy run is waiting for environment approval (production):
  ${run_url}

Approve in the GitHub UI (fine-grained PAT cannot review pending
deployments — GitHub returns 403 Resource not accessible by personal
access token). After approval this script continues watching.
EOF
    fi
    if [[ "$status" != "completed" ]]; then
      break
    fi
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Deploy dispatched, but could not resolve a live run id yet. Check Actions UI." >&2
  exit 1
fi

echo "Watching: ${run_url}"
# Wait through environment approval + jobs (up to ~45m).
for _ in $(seq 1 540); do
  status="$(
    GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run view "$run_id" \
      --json status,conclusion --jq '[.status,.conclusion] | join("|")'
  )"
  run_status="${status%%|*}"
  run_conclusion="${status#*|}"
  if [[ "$run_status" == "completed" ]]; then
    if [[ "$run_conclusion" == "success" ]]; then
      break
    fi
    echo "Deploy failed (${run_conclusion}). Logs: ${run_url}" >&2
    exit 1
  fi
  if [[ "$run_status" == "waiting" ]]; then
    sleep 5
    continue
  fi
  # queued / in_progress — hand off to gh run watch when jobs started
  if [[ "$run_status" == "in_progress" || "$run_status" == "queued" ]]; then
    GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run watch --exit-status "$run_id" || {
      echo "Deploy failed. Logs: ${run_url}" >&2
      exit 1
    }
    break
  fi
  sleep 5
done

echo "Deploy succeeded: ${run_url}"
echo "SHA: ${requested}"
echo "App: https://app.qlmed.com.br/"
