#!/bin/bash
# qlmed-pg-backup.sh — fallback pg_dump of the QLMED Postgres.
# The canonical full-server backup is server-backup.service; this utility keeps
# the legacy per-service restore path available for manual recovery.
# Writes to /srv/backups/qlmed-pg/ with 14-day retention.

set -euo pipefail

BACKUP_DIR=/srv/backups/qlmed-pg
RETENTION_DAYS=14
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK_FILE=/run/lock/qlmed-pg-backup.lock
DB_CONTAINER=qlmed-db
DB_USER=postgres
DB_NAME=postgres

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$BACKUP_DIR"
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# Single-instance lock so cron retries don't double up
exec 200>"$LOCK_FILE"
flock -n 200 || { log "already running, skipping"; exit 0; }

# The canonical Compose project uses a stable container name.
if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" != "true" ]; then
  log "ERROR: container $DB_CONTAINER is not running"
  exit 1
fi

STAMP=$(date +%Y%m%d-%H%M%S)
OUT_TMP="$BACKUP_DIR/.qlmed-${STAMP}.sql.gz.partial"
OUT_FINAL="$BACKUP_DIR/qlmed-${STAMP}.sql.gz"

log "backup start container=$DB_CONTAINER db=$DB_NAME → $OUT_FINAL"

# pg_dump runs inside the container, output piped to gzip on the host
# --format=plain so a future `zcat | psql` restore is trivial
if docker exec "$DB_CONTAINER" \
     pg_dump -U "$DB_USER" -d "$DB_NAME" --format=plain --no-owner --no-privileges 2>>"$LOG_FILE" \
   | gzip -9 > "$OUT_TMP"; then
  mv "$OUT_TMP" "$OUT_FINAL"
  SIZE=$(du -h "$OUT_FINAL" | cut -f1)
  log "backup ok size=$SIZE"
else
  rm -f "$OUT_TMP"
  log "ERROR: pg_dump failed (exit=$?)"
  exit 2
fi

# Retention — delete dumps older than RETENTION_DAYS

# Off-site upload to Google Drive (rclone)
if [ "${SKIP_OFFSITE:-0}" != "1" ] && command -v rclone >/dev/null 2>&1 && [ -f /home/marce/.config/rclone/rclone.conf ]; then
  if rclone --config /home/marce/.config/rclone/rclone.conf copy "$OUT_FINAL" gdrive:qlmed-server-backups/qlmed-pg/ --quiet 2>>"$LOG_FILE"; then
    echo "$(date '+%F %T') [$STAMP] uploaded to gdrive:qlmed-server-backups/qlmed-pg/" >> "$LOG_FILE"
  else
    echo "$(date '+%F %T') [$STAMP] WARNING: rclone upload failed (local backup still OK)" >> "$LOG_FILE"
  fi
  # Apply remote retention (same N days)
  rclone --config /home/marce/.config/rclone/rclone.conf delete gdrive:qlmed-server-backups/qlmed-pg/ \
    --min-age "${RETENTION_DAYS}d" --include "qlmed-*.sql.gz" --quiet 2>>"$LOG_FILE" || true
fi

DELETED=$(find "$BACKUP_DIR" -maxdepth 1 -name 'qlmed-*.sql.gz' -mtime "+$RETENTION_DAYS" -print -delete | wc -l)
[ "$DELETED" -gt 0 ] && log "rotated: deleted $DELETED old dump(s) (>$RETENTION_DAYS days)"

# Quick sanity: confirm file is a valid gzip and contains SQL
if ! gzip -t "$OUT_FINAL" 2>/dev/null; then
  log "ERROR: gzip integrity check failed on $OUT_FINAL"
  exit 3
fi
# zcat | head triggers SIGPIPE which would trip pipefail; isolate the check
HEAD=$( { zcat "$OUT_FINAL" 2>/dev/null || true; } | head -3 | tr -d '\n' | cut -c1-120 )
log "head: $HEAD..."
log "done"
