#!/bin/bash
# qlmed-backup-watchdog.sh — alerta se o backup Postgres QLMED do dia não existir.
# Stack qlmed-n8n aposentada (2026-09-06); n8n genérico em /srv/n8n fica fora deste watchdog.

set -uo pipefail

source /home/marce/ops/lib/lib-ops.sh

LOG_DIR="/srv/backups/ops-logs"
LOG_FILE="$LOG_DIR/qlmed-backup-watchdog.log"
PG_DIR="/srv/backups/qlmed-pg"
TODAY=$(date +%Y%m%d)
DATE_H=$(date +%Y-%m-%d)
TS=$(date -Iseconds)

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$LOG_DIR"

MISSING=""
FOUND=0
TOTAL=1

PG_FILE=$(find "$PG_DIR" -maxdepth 1 -type f -name "qlmed-${TODAY}-*.sql.gz" 2>/dev/null | sort | tail -1)

if [ -z "$PG_FILE" ]; then
  MISSING="${MISSING}  • Postgres QLMED — não encontrado\n"
elif [ ! -s "$PG_FILE" ]; then
  MISSING="${MISSING}  • Postgres QLMED — arquivo vazio (0 bytes)\n"
else
  FOUND=1
fi

echo "$TS | found=$FOUND/$TOTAL" >> "$LOG_FILE"

if [ -n "$MISSING" ]; then
  MSG="🚨 Backup Watchdog (server) — FALHA\n\n📅 ${DATE_H}\n📊 ${FOUND}/${TOTAL} backups OK\n\n❌ Problemas:\n${MISSING}\n⚠️ Verifique: /srv/qlmed/ops/scripts/qlmed-pg-backup.sh"
  wa_send "$(echo -e "$MSG")"
  echo "$TS | ALERTED — missing/empty backups" >> "$LOG_FILE"
fi
