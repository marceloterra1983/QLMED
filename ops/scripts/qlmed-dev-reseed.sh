#!/bin/bash
# qlmed-dev-reseed.sh — (re)seed qlmed_dev from the most recent production dump.
# Reuses the same restore mechanism validated in docs/server/BACKUP-RESTORE.md
# ("QLMED PostgreSQL — 2026-07-11 (full restore test)").
#
# Run on demand whenever dev needs fresh production data. Never the other way
# around: this script only ever reads FROM production dumps and writes TO
# qlmed_dev — it must never touch the `postgres` database (production).

set -euo pipefail

BACKUP_DIR=/srv/backups/qlmed-pg
ENV_FILE=/home/marce/qlmed/production/env/app.env
LOG_FILE=/var/log/qlmed-dev-reseed.log
LOCK_FILE=/run/lock/qlmed-dev-reseed.lock
NETWORK=lkwc0s0ck8kcckocc4goc0kg
PG_IMAGE=postgres:18-alpine

# Safety guard: this constant is the ONLY database this script is ever allowed
# to DROP/CREATE. Every destructive command below references $TARGET_DB
# instead of a hardcoded literal, so the guard below is functionally load-
# bearing — not just decorative next to an already-safe hardcode. If this
# constant is ever changed to `postgres` (or anything else) by mistake, the
# script refuses to run rather than risk touching production.
TARGET_DB="qlmed_dev"
if [ "$TARGET_DB" != "qlmed_dev" ]; then
  echo "FATAL: TARGET_DB must be exactly 'qlmed_dev', got '$TARGET_DB' — aborting to protect production." >&2
  exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Single-instance lock so concurrent runs don't race each other
exec 200>"$LOCK_FILE"
flock -n 200 || { log "already running, skipping"; exit 0; }

# (1) Locate the most recent production dump — never a live pg_dump against prod
LATEST_DUMP=$(ls -t "$BACKUP_DIR"/qlmed-*.sql.gz 2>/dev/null | head -1 || true)
if [ -z "$LATEST_DUMP" ]; then
  log "ERROR: no dump found in $BACKUP_DIR/qlmed-*.sql.gz"
  exit 1
fi
log "using dump: $LATEST_DUMP"

# (2) Parse DATABASE_URL: postgresql://user:pass@host:port/db?...
DB_URL=$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -1 | cut -d= -f2- | sed 's/^"//' | sed 's/"$//')
PG_USER=$(echo "$DB_URL" | sed -E 's|^postgres(ql)?://([^:]+):.*|\2|')
PG_PASS=$(echo "$DB_URL" | sed -E 's|^postgres(ql)?://[^:]+:([^@]+)@.*|\2|')

# (4) Terminate any active connections to $TARGET_DB before DROP (session on template1 — never postgres)
log "terminating active connections to $TARGET_DB"
docker run --rm -i --network "$NETWORK" -e PGPASSWORD="$PG_PASS" "$PG_IMAGE" \
  psql -h qlmed-db -U "$PG_USER" -d template1 -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${TARGET_DB}' AND pid <> pg_backend_pid();" \
  >>"$LOG_FILE" 2>&1

# (5) DROP + CREATE — both connect to template1, never to postgres, and both
# reference $TARGET_DB (guarded above) rather than a literal
log "dropping database $TARGET_DB (if exists)"
docker run --rm -i --network "$NETWORK" -e PGPASSWORD="$PG_PASS" "$PG_IMAGE" \
  psql -h qlmed-db -U "$PG_USER" -d template1 -c "DROP DATABASE IF EXISTS ${TARGET_DB};" \
  >>"$LOG_FILE" 2>&1

log "creating database $TARGET_DB"
docker run --rm -i --network "$NETWORK" -e PGPASSWORD="$PG_PASS" "$PG_IMAGE" \
  psql -h qlmed-db -U "$PG_USER" -d template1 -c "CREATE DATABASE ${TARGET_DB} OWNER postgres;" \
  >>"$LOG_FILE" 2>&1

# (6) Restore the dump into $TARGET_DB
log "restoring $LATEST_DUMP into $TARGET_DB"
zcat "$LATEST_DUMP" | docker run --rm -i --network "$NETWORK" -e PGPASSWORD="$PG_PASS" "$PG_IMAGE" \
  psql -h qlmed-db -U "$PG_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=0 \
  >>"$LOG_FILE" 2>&1

# (7) Log table count restored and finish
TABLE_COUNT=$(docker run --rm -i --network "$NETWORK" -e PGPASSWORD="$PG_PASS" "$PG_IMAGE" \
  psql -h qlmed-db -U "$PG_USER" -d "$TARGET_DB" -tAc \
  "SELECT count(*) FROM pg_tables WHERE schemaname='public';")
log "restored $TABLE_COUNT tables into $TARGET_DB"
log "done"
