#!/usr/bin/env bash
# qlmed-cte-dist-sync.sh — CT-e via SEFAZ CTeDistribuicaoDFe (mTLS A1).
# NSDocs store parou de trazer CT-e novos após 2026-07-02; DistDFe AN cobre o gap.
# Roda o Node sync DENTRO de qlmed-app (node-forge + Prisma + ENCRYPTION_KEY).
set -euo pipefail

# Default derivado do próprio diretório: o caminho absoluto antigo apontava para
# /home/marce/qlmed/ops/scripts, que deixou de existir no flatten do repo ops.
_HERE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT_SRC="${CTE_SYNC_SCRIPT:-$_HERE/qlmed-cte-dist-sync.js}"
STATE_HOST="${CTE_NSU_STATE_HOST:-/srv/qlmed/ops/state/cte-last-nsu}"
LOCK_DIR="${STATE_DIRECTORY:-/var/lib/qlmed-cte-dist-sync}"
LOG_DIR="${CTE_SYNC_LOG_DIR:-/srv/qlmed/ops/logs}"
CONTAINER="${QLMED_APP_CONTAINER:-qlmed-app}"

mkdir -p -m 0700 "$LOCK_DIR" "$(dirname "$STATE_HOST")" "$LOG_DIR"
exec 9>"$LOCK_DIR/sync.lock"
flock -n 9 || { echo "another cte-dist-sync running"; exit 0; }

if ! docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null | grep -q true; then
  echo "container $CONTAINER not running" >&2
  exit 1
fi

# Host NSU state → container (ephemeral /tmp); result copied back.
if [[ ! -f "$STATE_HOST" ]]; then
  printf '000000000011702\n' >"$STATE_HOST"
  chmod 600 "$STATE_HOST"
fi
# Persist CTE 656 cooldown across hourly runs (container /tmp is ephemeral per exec —
# map to host state via docker cp in the wrapper when present).
docker exec "$CONTAINER" rm -f /tmp/cte-nsu-state /tmp/qlmed-cte-dist-sync.js /tmp/cte-656-cooldown-until
docker cp "$SCRIPT_SRC" "$CONTAINER:/tmp/qlmed-cte-dist-sync.js"
docker exec -i "$CONTAINER" sh -c 'cat > /tmp/cte-nsu-state' <"$STATE_HOST"
COOLDOWN_HOST="$(dirname "$STATE_HOST")/cte-656-cooldown-until"
if [[ -f "$COOLDOWN_HOST" ]]; then
  docker cp "$COOLDOWN_HOST" "$CONTAINER:/tmp/cte-656-cooldown-until" 2>/dev/null || true
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
log="$LOG_DIR/cte-dist-sync-$stamp.log"

set +e
docker exec \
  -e QLMED_API_URL=http://127.0.0.1:3000 \
  -e CTE_NSU_STATE=/tmp/cte-nsu-state \
  -e CTE_656_COOLDOWN_FILE=/tmp/cte-656-cooldown-until \
  -e PFX_PATH=/tmp/cert.pfx \
  -e PASS_ENC=/tmp/cert.pass.enc \
  -e FORCE_CERT_FROM_DB=1 \
  -e CTE_QUERY_DELAY_MS="${CTE_QUERY_DELAY_MS:-2500}" \
  -e CTE_INGEST_DELAY_MS="${CTE_INGEST_DELAY_MS:-1200}" \
  -e CTE_MAX_LOOPS="${CTE_MAX_LOOPS:-20}" \
  -e CTE_UF_CODE="${CTE_UF_CODE:-50}" \
  -e CNPJ="${CNPJ:-07832309000197}" \
  "$CONTAINER" node /tmp/qlmed-cte-dist-sync.js \
  2>&1 | tee "$log"
rc=${PIPESTATUS[0]}
set -e

docker cp "$CONTAINER:/tmp/cte-nsu-state" "$STATE_HOST" 2>/dev/null || true
docker cp "$CONTAINER:/tmp/cte-656-cooldown-until" "$COOLDOWN_HOST" 2>/dev/null || true
chmod 600 "$STATE_HOST" "$COOLDOWN_HOST" 2>/dev/null || true

# Keep last 30 logs
find "$LOG_DIR" -name 'cte-dist-sync-*.log' -mtime +30 -delete 2>/dev/null || true

exit "$rc"
