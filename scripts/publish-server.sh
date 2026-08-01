#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-server.sh

Pushes the current main branch to origin, prints the full SHA, and prints
manual next steps. Does NOT run QLMED Production Deploy and does NOT wait
for health or CI.

After this script exits successfully you must:

  1. Wait for QLMED CI (push to main) to succeed for that SHA.
  2. Dispatch deploy-production.yml yourself (CLI or GitHub UI).
  3. Watch the Production Deploy workflow on GitHub.
  4. After it succeeds, run: npm run check:deploy

Example dispatch (only after CI is green for the same SHA):

  gh workflow run deploy-production.yml \
    --ref main \
    -f confirm_production=DEPLOY \
    -f revision=<FULL_40_CHAR_SHA>
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

for cmd in git bash; do
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

EXPECTED_HEAD="$(git rev-parse HEAD)"
EXPECTED_SHORT="$(git rev-parse --short=12 HEAD)"

echo "Pushing main to origin..."
git push origin main

echo
echo "Push succeeded."
echo "Full SHA: ${EXPECTED_HEAD}"
echo "Short:    ${EXPECTED_SHORT}"
echo
echo "Next steps (manual — this script does not deploy or wait):"
echo "  1. Wait for QLMED CI to succeed for push/main at SHA ${EXPECTED_HEAD}."
echo "  2. Dispatch production deploy (CLI or GitHub Actions UI), for example:"
echo
echo "     gh workflow run deploy-production.yml \\"
echo "       --ref main \\"
echo "       -f confirm_production=DEPLOY \\"
echo "       -f revision=${EXPECTED_HEAD}"
echo
echo "  3. Watch the QLMED Production Deploy workflow on GitHub until it succeeds."
echo "     (The workflow itself validates local/public health and revision.)"
echo "  4. After the workflow succeeds, run:"
echo
echo "     npm run check:deploy"
echo
echo "Done. No deploy was started by this script."
