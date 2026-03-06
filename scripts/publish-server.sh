#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-server.sh

Pushes the current main branch to origin and, if the push succeeds, deploys it
to the production server.
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

echo "Pushing main to origin..."
git push origin main

echo "Push succeeded. Deploying to server..."
bash ./scripts/deploy-server.sh
