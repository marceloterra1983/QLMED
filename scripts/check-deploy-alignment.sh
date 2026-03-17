#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/check-deploy-alignment.sh [--strict]

Compares:
  - local Git HEAD
  - origin/main
  - development health endpoint
  - public production health endpoint

Options:
  --strict  Exit with code 1 if production does not match origin/main, if local
            has unpublished commits, or if either endpoint cannot be checked.
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

STRICT=0
for arg in "$@"; do
  case "$arg" in
    --strict)
      STRICT=1
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 1
      ;;
  esac
done

for cmd in git curl node; do
  require_cmd "$cmd"
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

PUBLIC_URL="${QLMED_PUBLIC_HEALTH_URL:-https://app.qlmed.com.br/api/health}"
DEV_URL="${QLMED_DEV_HEALTH_URL:-http://100.123.233.116:3000/api/health}"

LOCAL_HEAD="$(git rev-parse HEAD)"
LOCAL_SHORT="$(git rev-parse --short=12 HEAD)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
DIRTY_STATE="clean"
if [[ -n "$(git status --porcelain)" ]]; then
  DIRTY_STATE="dirty"
fi

ORIGIN_HEAD=""
ORIGIN_SHORT=""
if git show-ref --verify --quiet refs/remotes/origin/main; then
  ORIGIN_HEAD="$(git rev-parse refs/remotes/origin/main)"
  ORIGIN_SHORT="$(git rev-parse --short=12 refs/remotes/origin/main)"
fi

BEHIND_COUNT=0
AHEAD_COUNT=0
if [[ -n "$ORIGIN_HEAD" ]]; then
  read -r BEHIND_COUNT AHEAD_COUNT < <(git rev-list --left-right --count origin/main...HEAD)
fi

fetch_health_summary() {
  local url="$1"
  local response=""

  if ! response="$(curl -fsS --max-time 15 "$url" 2>/dev/null)"; then
    printf 'unreachable\t\t\t\t\t\n'
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
    build.builtAt || '',
    typeof data.integrity?.healthy === 'boolean' ? String(data.integrity.healthy) : '',
  ];
  process.stdout.write(values.join('\t') + '\n');
} catch {
  process.stdout.write('invalid\t\t\t\t\t\n');
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

IFS=$'\t' read -r DEV_STATUS DEV_COMMIT_SHA DEV_COMMIT_SHORT DEV_SOURCE DEV_BUILT_AT DEV_INTEGRITY <<< "$(fetch_health_summary "$DEV_URL")"
IFS=$'\t' read -r PUBLIC_STATUS PUBLIC_COMMIT_SHA PUBLIC_COMMIT_SHORT PUBLIC_SOURCE PUBLIC_BUILT_AT PUBLIC_INTEGRITY <<< "$(fetch_health_summary "$PUBLIC_URL")"

PUBLIC_MATCHES_ORIGIN="no"
if [[ -n "$ORIGIN_HEAD" ]] && commit_matches "$PUBLIC_COMMIT_SHA" "$ORIGIN_HEAD"; then
  PUBLIC_MATCHES_ORIGIN="yes"
fi

PUBLIC_MATCHES_LOCAL="no"
if commit_matches "$PUBLIC_COMMIT_SHA" "$LOCAL_HEAD"; then
  PUBLIC_MATCHES_LOCAL="yes"
fi

printf 'Local repo\n'
printf '  branch: %s\n' "$BRANCH_NAME"
printf '  head: %s\n' "$LOCAL_SHORT"
printf '  working_tree: %s\n' "$DIRTY_STATE"
if [[ -n "$ORIGIN_SHORT" ]]; then
  printf '  origin/main: %s\n' "$ORIGIN_SHORT"
  printf '  ahead_of_origin: %s\n' "$AHEAD_COUNT"
  printf '  behind_origin: %s\n' "$BEHIND_COUNT"
fi

printf '\nDevelopment endpoint\n'
printf '  url: %s\n' "$DEV_URL"
printf '  status: %s\n' "$DEV_STATUS"
printf '  commit: %s\n' "${DEV_COMMIT_SHORT:-missing}"
printf '  source: %s\n' "${DEV_SOURCE:-missing}"
printf '  built_at: %s\n' "${DEV_BUILT_AT:-missing}"
printf '  integrity: %s\n' "${DEV_INTEGRITY:-n/a}"

printf '\nProduction endpoint\n'
printf '  url: %s\n' "$PUBLIC_URL"
printf '  status: %s\n' "$PUBLIC_STATUS"
printf '  commit: %s\n' "${PUBLIC_COMMIT_SHORT:-missing}"
printf '  source: %s\n' "${PUBLIC_SOURCE:-missing}"
printf '  built_at: %s\n' "${PUBLIC_BUILT_AT:-missing}"
printf '  integrity: %s\n' "${PUBLIC_INTEGRITY:-n/a}"

printf '\nAlignment\n'
printf '  production_matches_origin_main: %s\n' "$PUBLIC_MATCHES_ORIGIN"
printf '  production_matches_local_head: %s\n' "$PUBLIC_MATCHES_LOCAL"
printf '  local_has_unpublished_commits: %s\n' "$([[ "$AHEAD_COUNT" -gt 0 ]] && printf 'yes' || printf 'no')"

if [[ "$STRICT" -ne 1 ]]; then
  exit 0
fi

if [[ "$DIRTY_STATE" != "clean" ]]; then
  echo "Strict check failed: working tree is dirty." >&2
  exit 1
fi

if [[ "$DEV_STATUS" == "unreachable" || "$DEV_STATUS" == "invalid" ]]; then
  echo "Strict check failed: development endpoint is unavailable." >&2
  exit 1
fi

if [[ "$PUBLIC_STATUS" == "unreachable" || "$PUBLIC_STATUS" == "invalid" ]]; then
  echo "Strict check failed: production endpoint is unavailable." >&2
  exit 1
fi

if [[ "$AHEAD_COUNT" -gt 0 ]]; then
  echo "Strict check failed: local branch has unpublished commits." >&2
  exit 1
fi

if [[ "$PUBLIC_MATCHES_ORIGIN" != "yes" ]]; then
  echo "Strict check failed: production does not match origin/main." >&2
  exit 1
fi
