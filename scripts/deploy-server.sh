#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-server.sh

Deploys the current Git HEAD to the production server.

Defaults:
  DEPLOY_HOST=server
  DEPLOY_DIR=/home/marce/QLMED/production
  DEPLOY_PROJECT_NAME=qlmed
  DEPLOY_SERVICES="qlmed-db qlmed-app qlmed-n8n"
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

for cmd in git ssh tar curl; do
  require_cmd "$cmd"
done

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is dirty. Commit or stash your changes before deploying." >&2
  exit 1
fi

DEPLOY_HOST="${DEPLOY_HOST:-server}"
DEPLOY_DIR="${DEPLOY_DIR:-/home/marce/QLMED/production}"
DEPLOY_PROJECT_NAME="${DEPLOY_PROJECT_NAME:-qlmed}"
DEPLOY_SERVICES="${DEPLOY_SERVICES:-qlmed-db qlmed-app qlmed-n8n}"
DEPLOY_HEALTHCHECK_URL="${DEPLOY_HEALTHCHECK_URL:-http://127.0.0.1:13000/api/health}"

COMMIT_SHA="$(git rev-parse --short=12 HEAD)"
BRANCH_NAME="$(git rev-parse --abbrev-ref HEAD)"
DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RELEASE_NAME="$(date -u +%Y%m%d%H%M%S)-${COMMIT_SHA}"

read -r -d '' REMOTE_SCRIPT <<EOF || true
set -euo pipefail

DEPLOY_DIR=$(printf '%q' "$DEPLOY_DIR")
DEPLOY_PROJECT_NAME=$(printf '%q' "$DEPLOY_PROJECT_NAME")
DEPLOY_SERVICES=$(printf '%q' "$DEPLOY_SERVICES")
DEPLOY_HEALTHCHECK_URL=$(printf '%q' "$DEPLOY_HEALTHCHECK_URL")
RELEASE_NAME=$(printf '%q' "$RELEASE_NAME")
COMMIT_SHA=$(printf '%q' "$COMMIT_SHA")
BRANCH_NAME=$(printf '%q' "$BRANCH_NAME")
DEPLOYED_AT=$(printf '%q' "$DEPLOYED_AT")
BUILD_SOURCE=ssh-deploy

release_dir="\$DEPLOY_DIR/releases/\$RELEASE_NAME"
backup_dir="\$DEPLOY_DIR/backups/\$RELEASE_NAME"
app_dir="\$DEPLOY_DIR/app"
previous_dir="\$DEPLOY_DIR/.app-previous"
staging_dir="\$DEPLOY_DIR/.app-staging-\$RELEASE_NAME"
release_tarball="\$release_dir/app.tar.gz"

cleanup() {
  rm -rf "\$staging_dir"
}
trap cleanup EXIT

write_build_metadata() {
  local target_dir="\$1"

  cat > "\$target_dir/.deploy-meta.env" <<META
QLMED_BUILD_COMMIT_SHA=\$COMMIT_SHA
QLMED_BUILD_DEPLOYED_AT=\$DEPLOYED_AT
QLMED_BUILD_SOURCE=\$BUILD_SOURCE
META
}

load_build_metadata() {
  local target_dir="\$1"
  local fallback_source="\$2"

  if [[ -f "\$target_dir/.deploy-meta.env" ]]; then
    set -a
    # shellcheck disable=SC1090
    . "\$target_dir/.deploy-meta.env"
    set +a
    return
  fi

  export QLMED_BUILD_COMMIT_SHA=unknown
  export QLMED_BUILD_DEPLOYED_AT=
  export QLMED_BUILD_SOURCE="\$fallback_source"
}

sync_production_manifests() {
  cp "\$staging_dir/production/docker-compose.yml" "\$DEPLOY_DIR/docker-compose.yml"

  if [[ -f "\$staging_dir/production/docker-compose.coolify.yml" ]]; then
    cp "\$staging_dir/production/docker-compose.coolify.yml" "\$DEPLOY_DIR/docker-compose.coolify.yml"
  fi

  if [[ -f "\$staging_dir/production/README.md" ]]; then
    cp "\$staging_dir/production/README.md" "\$DEPLOY_DIR/README.md"
  fi

  if [[ -f "\$staging_dir/production/.env.example" ]]; then
    cp "\$staging_dir/production/.env.example" "\$DEPLOY_DIR/.env.example"
  fi
}

compose_up() {
  local -a deploy_services
  read -r -a deploy_services <<< "\$DEPLOY_SERVICES"

  cd "\$DEPLOY_DIR"
  docker compose --project-name "\$DEPLOY_PROJECT_NAME" up -d --build "\${deploy_services[@]}"
}

rm -rf "\$staging_dir" "\$previous_dir"
mkdir -p "\$DEPLOY_DIR/releases" "\$DEPLOY_DIR/backups" "\$release_dir" "\$backup_dir" "\$staging_dir"

cat > "\$release_tarball"
tar -xzf "\$release_tarball" -C "\$staging_dir"
write_build_metadata "\$staging_dir"
sync_production_manifests

if [[ -d "\$app_dir" ]]; then
  mv "\$app_dir" "\$previous_dir"
fi
mv "\$staging_dir" "\$app_dir"

rollback() {
  echo "Deploy failed. Rolling back..." >&2
  rm -rf "\$app_dir"
  if [[ -d "\$previous_dir" ]]; then
    mv "\$previous_dir" "\$app_dir"
    load_build_metadata "\$app_dir" rollback
    compose_up
  fi
}

load_build_metadata "\$app_dir" "\$BUILD_SOURCE"
if ! compose_up; then
  rollback
  exit 1
fi

healthy=0
for _ in \$(seq 1 45); do
  if curl -fsS "\$DEPLOY_HEALTHCHECK_URL" >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 2
done

if [[ "\$healthy" -ne 1 ]]; then
  rollback
  exit 1
fi

if [[ -d "\$previous_dir" ]]; then
  mv "\$previous_dir" "\$backup_dir/app"
fi

cat > "\$release_dir/REVISION" <<REVISION
branch=\$BRANCH_NAME
commit=\$COMMIT_SHA
deployed_at=\$DEPLOYED_AT
REVISION

echo "Deploy complete: \$COMMIT_SHA"
EOF

echo "Streaming ${BRANCH_NAME}@${COMMIT_SHA} to ${DEPLOY_HOST}..."
git archive --format=tar.gz HEAD | ssh "$DEPLOY_HOST" "bash -lc $(printf '%q' "$REMOTE_SCRIPT")"

echo "Verifying public health..."
PUBLIC_COMMIT_SHA=""
for _ in $(seq 1 30); do
  PUBLIC_HEALTH="$(curl -fsS "https://app.qlmed.com.br/api/health" || true)"
  PUBLIC_COMMIT_SHA="$(printf '%s' "$PUBLIC_HEALTH" | sed -n 's/.*"commitSha":"\([^"]*\)".*/\1/p')"
  if [[ "$PUBLIC_COMMIT_SHA" == "$COMMIT_SHA" ]]; then
    break
  fi
  sleep 2
done

if [[ "$PUBLIC_COMMIT_SHA" != "$COMMIT_SHA" ]]; then
  echo "Public health revision mismatch: expected ${COMMIT_SHA}, got ${PUBLIC_COMMIT_SHA:-missing}" >&2
  exit 1
fi
echo "Deploy complete: ${COMMIT_SHA}"
