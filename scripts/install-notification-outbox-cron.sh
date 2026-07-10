#!/usr/bin/env bash
set -euo pipefail

worker_source="${1:-}"
if [[ -z "$worker_source" || ! -f "$worker_source" ]]; then
  echo "Usage: install-notification-outbox-cron.sh /absolute/path/notification-outbox-worker.py" >&2
  exit 1
fi

python3 -m py_compile "$worker_source"

for invoice_type in NFE CTE; do
  env_dir="$(printf '%s' "$invoice_type" | tr '[:upper:]' '[:lower:]')-notify"
  env_file="/srv/qlmed/services/${env_dir}/.env"
  if [[ ! -r "$env_file" ]]; then
    echo "Notification worker environment is missing or unreadable: $env_file" >&2
    exit 1
  fi
  python3 "$worker_source" --invoice-type "$invoice_type" --env "$env_file" --smoke
done

worker_dir="/srv/qlmed/services/notification-outbox"
worker_target="${worker_dir}/worker.py"
mkdir -p "$worker_dir"
worker_tmp="$(mktemp "${worker_target}.XXXXXX")"
trap 'rm -f "$worker_tmp"' EXIT
install -m 0755 "$worker_source" "$worker_tmp"
mv -f "$worker_tmp" "$worker_target"

existing="$(crontab -l 2>/dev/null || true)"
filtered="$(printf '%s\n' "$existing" | grep -vE '/home/marce/(nfe|cte)-notify/(nfe|cte)_notify\.py|/home/marce/notification-outbox-worker\.py|/srv/qlmed/services/notification-outbox/worker\.py' || true)"

{
  printf '%s\n' "$filtered"
  echo '*/10 * * * * /usr/bin/python3 /srv/qlmed/services/notification-outbox/worker.py --invoice-type NFE --env /srv/qlmed/services/nfe-notify/.env >> /srv/qlmed/services/nfe-notify/cron.log 2>&1'
  echo '*/10 * * * * /usr/bin/python3 /srv/qlmed/services/notification-outbox/worker.py --invoice-type CTE --env /srv/qlmed/services/cte-notify/.env >> /srv/qlmed/services/cte-notify/cron.log 2>&1'
  echo '15 0 * * * /usr/bin/find /srv/qlmed/services/nfe-notify/cron.log /srv/qlmed/services/cte-notify/cron.log -type f -size +10M -exec /usr/bin/truncate -s 0 {} \; 2>/dev/null'
} | awk 'NF && !seen[$0]++' | crontab -

python3 -m py_compile "$worker_target"
