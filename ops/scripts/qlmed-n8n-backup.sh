#!/usr/bin/env bash
# Fallback backup for QLMED n8n (PostgreSQL + encryption-key volume).
# The canonical full-server backup is server-backup.service; this utility keeps
# a standalone recovery pair for manual use and auto-remediation.
set -euo pipefail

BACKUP_DIR=/srv/backups/n8n
LOG_FILE="$BACKUP_DIR/backup.log"
LOCK_FILE=/run/lock/qlmed-n8n-backup.lock
RETENTION_DAYS=14
DB_CONTAINER=qlmed-n8n-db
DB_USER=n8n
DB_NAME=n8n
CONFIG_VOLUME=qlmed_n8n_data
STAMP=$(date +%Y%m%d-%H%M%S)
DB_OUT="$BACKUP_DIR/n8n-${STAMP}.pgdump"
CONFIG_OUT="$BACKUP_DIR/n8n-config-${STAMP}.tar.gz"
DB_TMP="${DB_OUT}.partial"
CONFIG_TMP="${CONFIG_OUT}.partial"

sudo install -d -m 0700 -o "$(id -u)" -g "$(id -g)" "$BACKUP_DIR"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG_FILE"; }

exec 200>"$LOCK_FILE"
flock -n 200 || { log "already running, skipping"; exit 0; }
trap 'sudo rm -f "$DB_TMP" "$CONFIG_TMP"' EXIT

if [ "$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null || true)" != "true" ]; then
  log "ERROR: container $DB_CONTAINER is not running"
  exit 1
fi

log "backup start container=$DB_CONTAINER db=$DB_NAME"
docker exec "$DB_CONTAINER" pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc >"$DB_TMP"
docker run --rm -v "$DB_TMP:/backup/n8n.pgdump:ro" postgres:18-alpine \
  pg_restore --list /backup/n8n.pgdump >/dev/null
mv "$DB_TMP" "$DB_OUT"

docker run --rm \
  -v "$CONFIG_VOLUME:/source:ro" \
  -v "$BACKUP_DIR:/backup" \
  alpine:3.22 tar -C /source -czf "/backup/$(basename "$CONFIG_TMP")" .
sudo chown "$(id -u):$(id -g)" "$CONFIG_TMP"
tar -tzf "$CONFIG_TMP" >/dev/null
mv "$CONFIG_TMP" "$CONFIG_OUT"

log "backup ok db=$(du -h "$DB_OUT" | cut -f1) config=$(du -h "$CONFIG_OUT" | cut -f1)"

if [ "${SKIP_OFFSITE:-0}" != "1" ] && command -v rclone >/dev/null 2>&1 && [ -f /home/marce/.config/rclone/rclone.conf ]; then
  if rclone --config /home/marce/.config/rclone/rclone.conf copy \
       "$DB_OUT" gdrive:qlmed-server-backups/n8n/ --quiet 2>>"$LOG_FILE" && \
     rclone --config /home/marce/.config/rclone/rclone.conf copy \
       "$CONFIG_OUT" gdrive:qlmed-server-backups/n8n/ --quiet 2>>"$LOG_FILE"; then
    log "uploaded recovery pair to gdrive:qlmed-server-backups/n8n/"
  else
    log "WARNING: rclone upload failed (local backup still OK)"
  fi
  rclone --config /home/marce/.config/rclone/rclone.conf delete \
    gdrive:qlmed-server-backups/n8n/ --min-age "${RETENTION_DAYS}d" \
    --include "n8n-*.pgdump" --include "n8n-config-*.tar.gz" --quiet \
    2>>"$LOG_FILE" || true
fi

find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'n8n-*.pgdump' -o -name 'n8n-config-*.tar.gz' \) \
  -mtime "+$RETENTION_DAYS" -delete
log "done"
