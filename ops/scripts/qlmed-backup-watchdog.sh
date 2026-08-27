#!/bin/bash
# qlmed-backup-watchdog.sh — alerta se os backups do dia não existirem (server QLMED).
# Verifica os dumps de contingência por serviço. O watchdog canônico do
# snapshot completo é server-backup-watchdog.timer.

set -uo pipefail

source /home/marce/ops/lib/lib-ops.sh

LOG_DIR="/srv/backups/ops-logs"
LOG_FILE="$LOG_DIR/qlmed-backup-watchdog.log"
PG_DIR="/srv/backups/qlmed-pg"
N8N_DIR="/srv/backups/n8n"
TODAY=$(date +%Y%m%d)
DATE_H=$(date +%Y-%m-%d)
TS=$(date -Iseconds)

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$LOG_DIR"

MISSING=""
FOUND=0
TOTAL=3

PG_FILE=$(find "$PG_DIR" -maxdepth 1 -type f -name "qlmed-${TODAY}-*.sql.gz" 2>/dev/null | sort | tail -1)
N8N_FILE=$(find "$N8N_DIR" -maxdepth 1 -type f -name "n8n-${TODAY}-*.pgdump" 2>/dev/null | sort | tail -1)
N8N_CONFIG=$(find "$N8N_DIR" -maxdepth 1 -type f -name "n8n-config-${TODAY}-*.tar.gz" 2>/dev/null | sort | tail -1)

for pair in "Postgres QLMED|$PG_FILE" "n8n PostgreSQL|$N8N_FILE" "n8n config/key|$N8N_CONFIG"; do
  label="${pair%%|*}"; file="${pair#*|}"
  if [ -z "$file" ]; then
    MISSING="${MISSING}  • ${label} — não encontrado\n"
  elif [ ! -s "$file" ]; then
    MISSING="${MISSING}  • ${label} — arquivo vazio (0 bytes)\n"
  else
    FOUND=$((FOUND + 1))
  fi
done

echo "$TS | found=$FOUND/$TOTAL" >> "$LOG_FILE"

if [ -n "$MISSING" ]; then
  MSG="🚨 Backup Watchdog (server) — FALHA\n\n📅 ${DATE_H}\n📊 ${FOUND}/${TOTAL} backups OK\n\n❌ Problemas:\n${MISSING}\n⚠️ Verifique: /srv/qlmed/ops/scripts/qlmed-pg-backup.sh e /srv/qlmed/ops/scripts/qlmed-n8n-backup.sh"
  wa_send "$(echo -e "$MSG")"
  echo "$TS | ALERTED — missing/empty backups" >> "$LOG_FILE"
fi
