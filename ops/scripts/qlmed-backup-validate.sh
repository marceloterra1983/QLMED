#!/bin/bash
# qlmed-backup-validate.sh — valida integridade dos backups do dia (server QLMED).
# Valida os backups de contingência por serviço:
#   /srv/backups/qlmed-pg/qlmed-YYYYMMDD-HHMMSS.sql.gz   (pg_dump | gzip)
#   /srv/backups/n8n/n8n-YYYYMMDD-HHMMSS.pgdump          (pg_dump -Fc)
#   /srv/backups/n8n/n8n-config-YYYYMMDD-HHMMSS.tar.gz   (config + encryption key)

set -uo pipefail

source /home/marce/ops/lib/lib-ops.sh

LOG_DIR="/srv/backups/ops-logs"
LOG_FILE="$LOG_DIR/qlmed-backup-validate.log"
PG_DIR="/srv/backups/qlmed-pg"
N8N_DIR="/srv/backups/n8n"
TODAY=$(date +%Y%m%d)
DATE_H=$(date +%Y-%m-%d)
TS=$(date -Iseconds)

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$LOG_DIR"

ERRORS=""
RESULTS=""
TOTAL=0
PASSED=0

echo "=== Backup Validation $TS ===" >> "$LOG_FILE"

# valida_gz_sql <arquivo> — gzip ok + marcadores de dump PostgreSQL no início.
valida_gz_sql() {
  local f="$1" fn; fn=$(basename "$f")
  local size; size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  local mb; mb=$(to_mb "$size")
  TOTAL=$((TOTAL + 1))
  if [ "$size" -eq 0 ]; then
    ERRORS="${ERRORS}❌ $fn — vazio (0 bytes)\n"; RESULTS="${RESULTS}  ❌ $fn — vazio\n"
    echo "$TS | FAIL | $fn — empty" >> "$LOG_FILE"; return
  fi
  if ! gzip -t "$f" 2>/dev/null; then
    ERRORS="${ERRORS}❌ $fn — gzip corrompido\n"; RESULTS="${RESULTS}  ❌ $fn — gzip corrompido\n"
    echo "$TS | FAIL | $fn — bad gzip" >> "$LOG_FILE"; return
  fi
  local markers; markers=$( { zcat "$f" 2>/dev/null || true; } | head -80 | grep -cE "PostgreSQL|pg_dump|^SET |^CREATE |^COPY " )
  if [ "$markers" -gt 0 ]; then
    RESULTS="${RESULTS}  ✅ $fn — ${mb}MB, dump SQL válido\n"; PASSED=$((PASSED + 1))
    echo "$TS | OK | $fn — ${mb}MB, markers=$markers" >> "$LOG_FILE"
  else
    ERRORS="${ERRORS}❌ $fn — sem marcadores SQL\n"; RESULTS="${RESULTS}  ❌ $fn — SQL inválido\n"
    echo "$TS | FAIL | $fn — no SQL markers" >> "$LOG_FILE"
  fi
}

# valida_pgdump <arquivo> — pg_restore deve conseguir listar o dump completo.
valida_pgdump() {
  local f="$1" fn; fn=$(basename "$f")
  local size; size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  local mb; mb=$(to_mb "$size")
  TOTAL=$((TOTAL + 1))
  if [ "$size" -eq 0 ]; then
    ERRORS="${ERRORS}❌ $fn — vazio (0 bytes)\n"; RESULTS="${RESULTS}  ❌ $fn — vazio\n"
    echo "$TS | FAIL | $fn — empty" >> "$LOG_FILE"; return
  fi
  if docker run --rm -v "$f:/backup/n8n.pgdump:ro" postgres:18-alpine \
       pg_restore --list /backup/n8n.pgdump >/dev/null 2>&1; then
    RESULTS="${RESULTS}  ✅ $fn — ${mb}MB, pg_restore list OK\n"; PASSED=$((PASSED + 1))
    echo "$TS | OK | $fn — ${mb}MB, pg_restore list" >> "$LOG_FILE"
  else
    ERRORS="${ERRORS}❌ $fn — pgdump inválido\n"; RESULTS="${RESULTS}  ❌ $fn — pg_restore falhou\n"
    echo "$TS | FAIL | $fn — pg_restore list" >> "$LOG_FILE"
  fi
}

valida_config_tar() {
  local f="$1" fn; fn=$(basename "$f")
  local size; size=$(stat -c%s "$f" 2>/dev/null || echo 0)
  local mb; mb=$(to_mb "$size")
  TOTAL=$((TOTAL + 1))
  if [ "$size" -gt 0 ] && tar -tzf "$f" >/dev/null 2>&1; then
    RESULTS="${RESULTS}  ✅ $fn — ${mb}MB, tar válido\n"; PASSED=$((PASSED + 1))
    echo "$TS | OK | $fn — ${mb}MB, tar index" >> "$LOG_FILE"
  else
    ERRORS="${ERRORS}❌ $fn — tar vazio ou inválido\n"; RESULTS="${RESULTS}  ❌ $fn — tar inválido\n"
    echo "$TS | FAIL | $fn — tar index" >> "$LOG_FILE"
  fi
}

# Pega o backup mais recente do dia em cada diretório.
PG_FILE=$(find "$PG_DIR" -maxdepth 1 -type f -name "qlmed-${TODAY}-*.sql.gz" 2>/dev/null | sort | tail -1)
N8N_FILE=$(find "$N8N_DIR" -maxdepth 1 -type f -name "n8n-${TODAY}-*.pgdump" 2>/dev/null | sort | tail -1)
N8N_CONFIG=$(find "$N8N_DIR" -maxdepth 1 -type f -name "n8n-config-${TODAY}-*.tar.gz" 2>/dev/null | sort | tail -1)

if [ -n "$PG_FILE" ]; then valida_gz_sql "$PG_FILE"; else
  TOTAL=$((TOTAL + 1)); ERRORS="${ERRORS}❌ pg — nenhum dump de hoje\n"; RESULTS="${RESULTS}  ❌ pg — ausente\n"
  echo "$TS | FAIL | pg — missing today" >> "$LOG_FILE"; fi

if [ -n "$N8N_FILE" ]; then valida_pgdump "$N8N_FILE"; else
  TOTAL=$((TOTAL + 1)); ERRORS="${ERRORS}❌ n8n — nenhum backup de hoje\n"; RESULTS="${RESULTS}  ❌ n8n — ausente\n"
  echo "$TS | FAIL | n8n — missing today" >> "$LOG_FILE"; fi

if [ -n "$N8N_CONFIG" ]; then valida_config_tar "$N8N_CONFIG"; else
  TOTAL=$((TOTAL + 1)); ERRORS="${ERRORS}❌ n8n config — nenhum backup de hoje\n"; RESULTS="${RESULTS}  ❌ n8n config — ausente\n"
  echo "$TS | FAIL | n8n config — missing today" >> "$LOG_FILE"; fi

if [ -n "$ERRORS" ]; then STATUS="⚠️ COM ERROS"; else STATUS="✅ OK"; fi
MSG="🔍 Validação Backup (server) — $DATE_H\n\n"
MSG="${MSG}📊 Resultado: ${PASSED}/${TOTAL} ${STATUS}\n\n"
MSG="${MSG}📁 Arquivos:\n${RESULTS}"
[ -n "$ERRORS" ] && MSG="${MSG}\n🚨 Erros:\n${ERRORS}"

# Só notifica WhatsApp quando há erro (evita ruído diário). Sucesso fica no log.
if [ -n "$ERRORS" ]; then
  wa_send "$(echo -e "$MSG")"
fi

echo "$TS | COMPLETE | ${PASSED}/${TOTAL} passed" >> "$LOG_FILE"
