#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-server.sh

Deploys the current Git HEAD to the production server.

Defaults:
  DEPLOY_HOST=server
  DEPLOY_DIR=/home/marce/qlmed-server-deploy
  DEPLOY_PROJECT_NAME=qlmed
  DEPLOY_APP_SERVICE=qlmed-app
  DEPLOY_HEALTHCHECK_URL=http://127.0.0.1:13000/api/health
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

for cmd in git ssh scp tar mktemp curl; do
  require_cmd "$cmd"
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash your changes before deploying." >&2
  exit 1
fi

DEPLOY_HOST="${DEPLOY_HOST:-server}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/marce/qlmed-server-deploy}"
DEPLOY_PROJECT_NAME="${DEPLOY_PROJECT_NAME:-qlmed}"
DEPLOY_APP_SERVICE="${DEPLOY_APP_SERVICE:-qlmed-app}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1:13000/api/health}"

COMMIT_SHA="$(git rev-parse --short HEAD)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RELEASE_NAME="$(date -u +%Y%m%d%H%M%S)-${COMMIT_SHA}"

ARCHIVE_PATH="$(mktemp "/tmp/qlmed-${RELEASE_NAME}-XXXXXX.tar.gz")"
REMOTE_TARBALL="/tmp/${RELEASE_NAME}.tar.gz"
trap 'rm -f "$ARCHIVE_PATH"' EXIT

git archive --format=tar.gz --output "$ARCHIVE_PATH" HEAD

echo "Uploading ${BRANCH_NAME}@${COMMIT_SHA} to ${DEPLOY_HOST}..."
ssh "$DEPLOY_HOST" "mkdir -p '$DEPLOY_DIR/releases' '$DEPLOY_DIR/backups'"
scp "$ARCHIVE_PATH" "$DEPLOY_HOST:$REMOTE_TARBALL"

echo "Applying deploy on ${DEPLOY_HOST}..."
ssh "$DEPLOY_HOST" \
  "DEPLOY_DIR='$DEPLOY_DIR' \
   DEPLOY_PROJECT_NAME='$DEPLOY_PROJECT_NAME' \
   DEPLOY_APP_SERVICE='$DEPLOY_APP_SERVICE' \
   DEPLOY_HEALTHCHECK_URL='$DEPLOY_HEALTHCHECK_URL' \
   RELEASE_NAME='$RELEASE_NAME' \
   COMMIT_SHA='$COMMIT_SHA' \
   BRANCH_NAME='$BRANCH_NAME' \
   DEPLOYED_AT='$DEPLOYED_AT' \
   REMOTE_TARBALL='$REMOTE_TARBALL' \
   bash -s" <<'EOF'
set -euo pipefail

release_dir="$DEPLOY_DIR/releases/$RELEASE_NAME"
backup_dir="$DEPLOY_DIR/backups/$RELEASE_NAME"
app_dir="$DEPLOY_DIR/app"
previous_dir="$DEPLOY_DIR/.app-previous"
staging_dir="$DEPLOY_DIR/.app-staging-$RELEASE_NAME"

cleanup() {
  rm -rf "$staging_dir"
  rm -f "$REMOTE_TARBALL"
}
trap cleanup EXIT

rm -rf "$staging_dir" "$previous_dir"
mkdir -p "$release_dir" "$backup_dir" "$staging_dir"
mv "$REMOTE_TARBALL" "$release_dir/app.tar.gz"
tar -xzf "$release_dir/app.tar.gz" -C "$staging_dir"

if [[ -d "$app_dir" ]]; then
  mv "$app_dir" "$previous_dir"
fi
mv "$staging_dir" "$app_dir"

rollback() {
  echo "Deploy failed. Rolling back..." >&2
  rm -rf "$app_dir"
  if [[ -d "$previous_dir" ]]; then
    mv "$previous_dir" "$app_dir"
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
  rollback
  exit 1
fi

healthy=0
for _ in $(seq 1 45); do
  if curl -fsS "$DEPLOY_HEALTHCHECK_URL" >/dev/null; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "$healthy" -ne 1 ]]; then
  rollback
  exit 1
fi

if [[ -d "$previous_dir" ]]; then
  mv "$previous_dir" "$backup_dir/app"
fi

cat > "$release_dir/REVISION" <<REVISION
branch=$BRANCH_NAME
commit=$COMMIT_SHA
deployed_at=$DEPLOYED_AT
REVISION

echo "Deploy complete: $COMMIT_SHA"
EOF

echo "Verifying public health..."
curl -fsS "https://app.qlmed.com.br/api/health" >/dev/null
echo "Deploy complete: ${COMMIT_SHA}"
