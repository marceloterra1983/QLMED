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
# Token só neste processo — não altera hosts.yml / git credential do agente.
GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh workflow run deploy-production.yml \
  --ref main \
  -f confirm_production=DEPLOY \
  -f revision="$requested"

echo "Waiting for workflow run to appear..."
run_id=""
run_url=""
for _ in $(seq 1 30); do
  mapfile -t run_fields < <(
    GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run list \
      --workflow=deploy-production.yml \
      --branch main \
      --event workflow_dispatch \
      --limit 1 \
      --json databaseId,url,createdAt \
      --jq '.[0] | [.databaseId, .url] | .[]'
  )
  if [[ "${#run_fields[@]}" -eq 2 && -n "${run_fields[0]}" ]]; then
    run_id="${run_fields[0]}"
    run_url="${run_fields[1]}"
    break
  fi
  sleep 2
done

if [[ -z "$run_id" ]]; then
  echo "Deploy dispatched, but could not resolve run id yet. Check Actions UI." >&2
  exit 0
fi

echo "Watching: ${run_url}"
GH_TOKEN="$QLMED_DEPLOY_GH_TOKEN" gh run watch --exit-status "$run_id" || {
  echo "Deploy failed. Logs: ${run_url}" >&2
  exit 1
}

echo "Deploy succeeded: ${run_url}"
echo "SHA: ${requested}"
echo "App: https://app.qlmed.com.br/"
