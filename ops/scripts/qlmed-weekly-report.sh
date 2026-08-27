#!/bin/bash
# qlmed-weekly-report.sh — digest semanal consolidado do server QLMED via WhatsApp.
# Versão self-contained (não depende dos JSONs do charlie). Calcula tudo ao vivo.
# Cron sugerido: 0 9 * * 0 (domingo 09:00).
set -uo pipefail

source /home/marce/ops/lib/lib-ops.sh

LOG_DIR="/srv/backups/ops-logs"
LOG_FILE="$LOG_DIR/qlmed-weekly-report.log"
TS=$(date -Iseconds)
WEEK_START=$(date -d "7 days ago" +%Y-%m-%d)
WEEK_END=$(date +%Y-%m-%d)
PG_DIR="/srv/backups/qlmed-pg"
N8N_DIR="/srv/backups/n8n"

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$LOG_DIR"

# count_recent <logfile> <substring> — conta linhas da janela de 7 dias (timestamp ISO col 1-10).
count_recent() {
  [ -f "$1" ] || { echo 0; return; }
  awk -v d="$WEEK_START" -v s="$2" 'substr($0,1,10) >= d && index($0,s){n++} END{print n+0}' "$1"
}

# 1. Disco
DISK_LINE=$(df -h / | tail -1)
DISK_USED=$(echo "$DISK_LINE" | awk '{print $3}')
DISK_TOTAL=$(echo "$DISK_LINE" | awk '{print $2}')
DISK_PCT=$(echo "$DISK_LINE" | awk '{print $5}')

# 2. Containers
RUNNING=$(docker ps -q | wc -l)
UNHEALTHY=$(docker ps --filter health=unhealthy --format '{{.Names}}' | tr '\n' ' ')
UNHEALTHY_N=$(docker ps --filter health=unhealthy -q | wc -l)

# 3. Docker reclaimable (imagens)
IMG_RECLAIM=$(docker system df --format '{{.Type}} {{.Reclaimable}}' 2>/dev/null | awk '/Images/{print $2}')

# 4. Backups da semana
PG_WEEK=$(find "$PG_DIR" -maxdepth 1 -name 'qlmed-*.sql.gz' -newermt "$WEEK_START" 2>/dev/null | wc -l)
N8N_WEEK=$(find "$N8N_DIR" -maxdepth 1 -name 'n8n-*.pgdump' -newermt "$WEEK_START" 2>/dev/null | wc -l)
BK_SIZE=$(du -sh /srv/backups/ 2>/dev/null | awk '{print $1}')

# 5. Validação de backup (semana)
VAL_OK=$(count_recent "$LOG_DIR/qlmed-backup-validate.log" "| OK |")
VAL_FAIL=$(count_recent "$LOG_DIR/qlmed-backup-validate.log" "| FAIL |")

# 6. Restarts da Evolution (semana)
EVO_RESTARTS=$(count_recent /srv/qlmed/ops/logs/qlmed-evolution-restart.log "RESTART COMPLETE")

# 7. Última cópia off-site (gdrive)
LAST_OFFSITE=$(grep -h "uploaded to gdrive" /srv/backups/qlmed-pg/backup.log 2>/dev/null | tail -1 | grep -oE '^[0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]{8}')
[ -z "$LAST_OFFSITE" ] && LAST_OFFSITE="(sem registro)"

# 8. n8n QLMED — workflows ativos + última execução (API local)
N8N_LINES=""
# Extrai só a chave necessária em vez de sourcear o secrets.env inteiro
# (auditoria 2026-07-21) — não expõe as demais variáveis no ambiente do script.
N8N_API_KEY=$(grep -m1 '^N8N_API_KEY=' /home/marce/.claude/secrets.env 2>/dev/null | cut -d= -f2- | tr -d '"'"'"'"')
if [ -n "${N8N_API_KEY:-}" ]; then
  N8N_LINES=$(N8N_API_KEY="$N8N_API_KEY" python3 - <<'PY' 2>/dev/null || true
import json, os, urllib.request
API = "http://127.0.0.1:5678/api/v1"
KEY = os.environ["N8N_API_KEY"]
def get(path):
    r = urllib.request.Request(API + path, headers={"X-N8N-API-KEY": KEY})
    with urllib.request.urlopen(r, timeout=15) as resp:
        return json.load(resp)
items = get("/workflows?limit=50").get("data") or []
active = [w for w in items if w.get("active")]
lines = [f"  • ativos: {len(active)} / total {len(items)}"]
for w in sorted(active, key=lambda x: x.get("name") or ""):
    wid = w["id"]
    name = w.get("name") or wid
    try:
        ex = get(f"/executions?workflowId={wid}&limit=1").get("data") or []
        if ex:
            e = ex[0]
            last = f"{e.get('status')} @ {str(e.get('startedAt') or '')[:16]}"
        else:
            last = "sem execuções"
    except Exception:
        last = "?"
    lines.append(f"  • {name}: {last}")
print("\n".join(lines))
PY
)
fi
[ -z "$N8N_LINES" ] && N8N_LINES="  • (API n8n indisponível)"

# Monta mensagem
HEALTH_LINE="✅ ${RUNNING} rodando, 0 unhealthy"
[ "$UNHEALTHY_N" -gt 0 ] && HEALTH_LINE="⚠️ ${RUNNING} rodando, ${UNHEALTHY_N} unhealthy: ${UNHEALTHY}"

VAL_LINE="✅ ${VAL_OK} OK"
[ "${VAL_FAIL:-0}" -gt 0 ] && VAL_LINE="⚠️ ${VAL_OK} OK / ${VAL_FAIL} FALHA"

MSG="📊 Relatório Semanal — Server QLMED
📅 ${WEEK_START} a ${WEEK_END}

🖥️ Disco: ${DISK_USED}/${DISK_TOTAL} (${DISK_PCT})
📦 Containers: ${HEALTH_LINE}
🧹 Imagens recuperáveis: ${IMG_RECLAIM:-?}

💾 Backups (7d):
  • Postgres: ${PG_WEEK} | n8n: ${N8N_WEEK}
  • Validação: ${VAL_LINE}
  • Tamanho local: ${BK_SIZE}
  • Off-site (gdrive): ${LAST_OFFSITE}

🔄 Restarts Evolution: ${EVO_RESTARTS}

⚙️ n8n QLMED:
${N8N_LINES}"

wa_send "$MSG" && echo "$TS | SENT weekly report" >> "$LOG_FILE" || echo "$TS | FALHA ao enviar" >> "$LOG_FILE"
