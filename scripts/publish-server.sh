#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-server.sh

Pushes the current main branch to origin and waits for public production to
serve the same revision through Coolify.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  exit 0
fi

if [[ $# -ne 0 ]]; then
  usage >&2
  exit 1
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in git curl node bash; do
  require_cmd "$cmd"
done

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

branch_name="$(git rev-parse --abbrev-ref HEAD)"
if [[ "$branch_name" != "main" ]]; then
  echo "Publish is only allowed from main. Current branch: $branch_name" >&2
  exit 1
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash your changes before publishing." >&2
  exit 1
fi

PUBLIC_HEALTH_URL="${QLMED_PUBLIC_HEALTH_URL:-https://app.qlmed.com.br/api/health}"
PUBLISH_WAIT_ATTEMPTS="${QLMED_PUBLISH_WAIT_ATTEMPTS:-90}"
PUBLISH_WAIT_SECONDS="${QLMED_PUBLISH_WAIT_SECONDS:-5}"
EXPECTED_HEAD="$(git rev-parse HEAD)"
EXPECTED_SHORT="$(git rev-parse --short=12 HEAD)"

fetch_public_revision() {
  local response=""

  if ! response="$(curl -fsS --max-time 15 "$PUBLIC_HEALTH_URL" 2>/dev/null)"; then
    printf 'unreachable\t\t\t\t\n'
    return
  fi

  HEALTH_PAYLOAD="$response" node <<'NODE'
const payload = process.env.HEALTH_PAYLOAD;

try {
  const data = JSON.parse(payload || '{}');
  const build = data.build || {};
  const values = [
    data.status || 'unknown',
    build.commitSha || '',
    build.commitShort || '',
    build.source || '',
    typeof data.integrity?.healthy === 'boolean' ? String(data.integrity.healthy) : '',
  ];
  process.stdout.write(values.join('\t') + '\n');
} catch {
  process.stdout.write('invalid\t\t\t\t\n');
}
NODE
}

commit_matches() {
  local left="$1"
  local right="$2"

  if [[ -z "$left" || -z "$right" ]]; then
    return 1
  fi

  [[ "$left" == "$right" || "$left" == "$right"* || "$right" == "$left"* ]]
}

echo "Pushing main to origin..."
git push origin main

echo "Push succeeded. Waiting for Coolify to publish ${EXPECTED_SHORT}..."

for attempt in $(seq 1 "$PUBLISH_WAIT_ATTEMPTS"); do
  IFS=$'\t' read -r PUBLIC_STATUS PUBLIC_COMMIT_SHA PUBLIC_COMMIT_SHORT PUBLIC_SOURCE PUBLIC_INTEGRITY <<< "$(fetch_public_revision)"

  if commit_matches "$PUBLIC_COMMIT_SHA" "$EXPECTED_HEAD"; then
    echo "Public production now serves ${PUBLIC_COMMIT_SHORT:-$EXPECTED_SHORT} (${PUBLIC_SOURCE:-unknown})."
    echo
    bash ./scripts/check-deploy-alignment.sh
    exit 0
  fi

  echo "Attempt ${attempt}/${PUBLISH_WAIT_ATTEMPTS}: status=${PUBLIC_STATUS:-unknown} commit=${PUBLIC_COMMIT_SHORT:-missing} source=${PUBLIC_SOURCE:-missing} integrity=${PUBLIC_INTEGRITY:-n/a}"
  sleep "$PUBLISH_WAIT_SECONDS"
done

echo "Timed out waiting for public production to serve ${EXPECTED_SHORT}." >&2
echo "Last public revision: ${PUBLIC_COMMIT_SHORT:-missing} (${PUBLIC_SOURCE:-missing})" >&2
exit 1
