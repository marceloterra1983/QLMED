#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

chmod 755 scripts/deploy-server.sh scripts/rollback-server.sh scripts/publish-server.sh scripts/install-git-alias.sh
git config alias.publish '!bash ./scripts/publish-server.sh'

echo "Configured git alias: git publish"
