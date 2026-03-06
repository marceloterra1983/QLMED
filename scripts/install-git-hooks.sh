#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

chmod 755 .githooks/post-push
chmod 755 scripts/deploy-server.sh scripts/rollback-server.sh scripts/install-git-hooks.sh
git config core.hooksPath .githooks

echo "Configured git hooks path: $(git config --get core.hooksPath)"
echo "post-push hook is active."
