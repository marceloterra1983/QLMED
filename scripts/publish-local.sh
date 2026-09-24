#!/usr/bin/env bash
# Publica um SHA que já tem recibo. Chamado só por deploy-local.sh --publish.
# Mesmos passos do antigo deploy-production.yml, sem GitHub Actions.
set -euo pipefail

sha="${1:?SHA}"
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

export QLMED_DEPLOY_HOST="${QLMED_DEPLOY_HOST:-vps2}"
export QLMED_PROD_DIR="${QLMED_PROD_DIR:-/home/marce/qlmed/production}"
export QLMED_DEPLOY_RUN_ID="${QLMED_DEPLOY_RUN_ID:-local$(date -u +%Y%m%d%H%M%S)}"
export ROLLBACK_IMAGE_AVAILABLE="${ROLLBACK_IMAGE_AVAILABLE:-0}"
APP_VERIFIED=0

lock_dir="/home/marce/qlmed/var"
mkdir -p "$lock_dir"
exec 9>"${lock_dir}/qlmed-publish.lock"
if ! flock -n 9; then
  echo "Refusing publish: another publish holds ${lock_dir}/qlmed-publish.lock" >&2
  exit 1
fi

on_exit() {
  local status=$?
  if [[ "$status" -ne 0 && "$ROLLBACK_IMAGE_AVAILABLE" == "1" && "$APP_VERIFIED" != "1" ]]; then
    echo "Publish failed before the public check; restoring the previous image" >&2
    bash scripts/qlmed-deploy-vps2.sh rollback || true
  fi
}
trap on_exit EXIT

bash scripts/qlmed-deploy-vps2.sh ping

running="$(docker inspect qlmed-app --format '{{.State.Running}}' 2>/dev/null || echo false)"
if [[ "$running" == "true" ]]; then
  echo "Refusing publish: qlmed-app is running on this host; writer is ${QLMED_DEPLOY_HOST}" >&2
  exit 1
fi

mkdir -p "${QLMED_PROD_DIR}"
cp production/docker-compose.yml "${QLMED_PROD_DIR}/docker-compose.yml"
rsync -e "ssh -o BatchMode=yes -o ConnectTimeout=30" -a \
  "${QLMED_PROD_DIR}/docker-compose.yml" \
  "${QLMED_DEPLOY_HOST}:${QLMED_PROD_DIR}/docker-compose.yml"

mkdir -p "${QLMED_PROD_DIR}/app"
rsync -rl --delete \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.env' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude 'production' \
  ./ "${QLMED_PROD_DIR}/app/"
ssh -o BatchMode=yes -o ConnectTimeout=30 "${QLMED_DEPLOY_HOST}" \
  "mkdir -p ${QLMED_PROD_DIR}/app"
rsync -e "ssh -o BatchMode=yes -o ConnectTimeout=30" -rl --delete \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.env' \
  --exclude '.next' \
  --exclude 'node_modules' \
  --exclude 'production' \
  ./ "${QLMED_DEPLOY_HOST}:${QLMED_PROD_DIR}/app/"

cat > "${QLMED_PROD_DIR}/.deploy-meta.env" <<EOF
QLMED_BUILD_COMMIT_SHA=${sha}
QLMED_BUILD_DEPLOYED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)
QLMED_BUILD_SOURCE=local
EOF
rsync -e "ssh -o BatchMode=yes -o ConnectTimeout=30" -a \
  "${QLMED_PROD_DIR}/.deploy-meta.env" \
  "${QLMED_DEPLOY_HOST}:${QLMED_PROD_DIR}/.deploy-meta.env"

capture_out="$(bash scripts/qlmed-deploy-vps2.sh capture-rollback || true)"
printf '%s\n' "$capture_out"
if printf '%s\n' "$capture_out" | grep -q '^ROLLBACK_IMAGE_AVAILABLE=1$'; then
  ROLLBACK_IMAGE_AVAILABLE=1
fi

set -a
# shellcheck disable=SC1091
. "${QLMED_PROD_DIR}/.deploy-meta.env"
set +a
docker compose \
  --project-name qlmed \
  --env-file "${QLMED_PROD_DIR}/.env" \
  -f "${QLMED_PROD_DIR}/docker-compose.yml" \
  build qlmed-app

bash scripts/qlmed-deploy-vps2.sh load-image "qlmed-app:${sha}"
bash scripts/qlmed-deploy-vps2.sh release
bash scripts/qlmed-deploy-vps2.sh health 30
bash scripts/qlmed-deploy-vps2.sh verify-revision "${sha}"

for attempt in $(seq 1 30); do
  if curl -fsSI https://app.qlmed.com.br/ >/dev/null; then
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    echo "Public check failed for https://app.qlmed.com.br/" >&2
    exit 1
  fi
  sleep 2
done
APP_VERIFIED=1

for attempt in 1 2 3 4 5; do
  if bash scripts/qlmed-deploy-vps2.sh install-outbox; then
    break
  fi
  if [[ "$attempt" -eq 5 ]]; then
    echo "Outbox worker install failed" >&2
    exit 1
  fi
  echo "Worker install attempt ${attempt} failed; retrying in 5s" >&2
  sleep 5
done

if [[ "$ROLLBACK_IMAGE_AVAILABLE" == "1" ]]; then
  bash scripts/qlmed-deploy-vps2.sh tag-previous
  bash scripts/qlmed-deploy-vps2.sh rmi-rollback
else
  echo "No previous image to tag"
fi

echo "PUBLISH_OK ${sha}"
