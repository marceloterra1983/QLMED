#!/usr/bin/env bash
# RETIRED 2026-09-06 — stack qlmed-n8n removida do host.
# Backup de aposentadoria: /srv/qlmed/ops/backups/n8n-retire-*
# O n8n genérico (/srv/n8n) não é coberto por este script.
set -euo pipefail
echo "[$(date '+%F %T')] qlmed-n8n-backup: retired (qlmed-n8n gone); no-op" >&2
exit 0
