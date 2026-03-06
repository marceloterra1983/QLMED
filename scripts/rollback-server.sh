#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/rollback-server.sh --list
  scripts/rollback-server.sh latest
  scripts/rollback-server.sh <release-name>

Defaults:
  DEPLOY_HOST=server
  DEPLOY_DIR=/home/marce/qlmed-server-deploy
  DEPLOY_PROJECT_NAME=qlmed
  DEPLOY_APP_SERVICE=qlmed-app
  DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:13000/api/health
EOF
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

for cmd in ssh curl; do
  require_cmd "$cmd"
done

DEPLOY_HOST="${DEPLOY_HOST:-server}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/marce/qlmed-server-deploy}"
DEPLOY_PROJECT_NAME="${DEPLOY_PROJECT_NAME:-qlmed}"
DEPLOY_APP_SERVICE="${DEPLOY_APP_SERVICE:-qlmed-app}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1:13000/api/health}"

target="${1:-}"

if [[ -z "$target" || "$target" == "--help" || "$target" == "-h" ]]; then
  usage
  exit 0
fi

if [[ "$target" == "--list" ]]; then
  ssh "$DEPLOY_HOST" "find '$DEPLOY_DIR/backups' -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r"
  exit 0
fi

if [[ "$target" == "latest" ]]; then
  target="$(ssh "$DEPLOY_HOST" "find '$DEPLOY_DIR/backups' -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -r | head -n 1")"
  if [[ -z "$target" ]]; then
    echo "No rollback backups found." >&2
    exit 1
  fi
fi

echo "Rolling back production app to backup: $target"

ssh "$DEPLOY_HOST" \
  "DEPLOY_DIR='$DEPLOY_DIR' \
   DEPLOY_PROJECT_NAME='$DEPLOY_PROJECT_NAME' \
   DEPLOY_APP_SERVICE='$DEPLOY_APP_SERVICE' \
   DEPLOY_HEALTHCHECK_URL='$DEPLOY_HEALTHCHECK_URL' \
   TARGET_RELEASE='$target' \
   bash -s" <<'EOF'
set -euo pipefail

backup_app="$DEPLOY_DIR/backups/$TARGET_RELEASE/app"
app_dir="$DEPLOY_DIR/app"
current_backup="$DEPLOY_DIR/.rollback-current-$TARGET_RELEASE"

if [[ ! -d "$backup_app" ]]; then
  echo "Backup not found: $backup_app" >&2
  exit 1
fi

rm -rf "$current_backup"
if [[ -d "$app_dir" ]]; then
  mv "$app_dir" "$current_backup"
fi
cp -a "$backup_app" "$app_dir"

rollback_restore() {
  echo "Rollback failed. Restoring previous app..." >&2
  rm -rf "$app_dir"
  if [[ -d "$current_backup" ]]; then
    mv "$current_backup" "$app_dir"
    (
      cd "$DEPLOY_DIR"
      docker compose --project-name "$DEPLOY_PROJECT_NAME" up -d --build "$DEPLOY_APP_SERVICE"
    )
  fi
}

if ! (
  cd "$DEPLOY_DIR"
  docker compose --project-name "$DEPLOY_PROJECT_NAME" up -d --build "$DEPLOY_APP_SERVICE"
); then
  rollback_restore
  exit 1
fi

healthy=0
for _ in $(seq 1 45); do
  if curl -fsS "$DEPLOY_HEALTHCHECK_URL" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  rollback_restore
  exit 1
fi

echo "Rollback complete: $TARGET_RELEASE"
EOF
