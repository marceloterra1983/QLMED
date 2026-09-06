#!/usr/bin/env bash
# qlmed-daily-summary-catchup.sh — reenvia o Resumo Diário se o tick 18h
# America/Campo_Grande do app foi perdido (PC desligado / processo fora).
#
# Idempotente: estado local + POST no app nativo
# /api/system/daily-issued-summary. Sem n8n.
#
# Uso:
#   qlmed-daily-summary-catchup.sh           # produção
#   qlmed-daily-summary-catchup.sh --dry-run # só decide / dryRun no app
set -euo pipefail
umask 077

tag=qlmed-daily-summary-catchup
tz=America/Campo_Grande
api_url="${QLMED_API_URL:-http://127.0.0.1:13000}"
endpoint="${api_url%/}/api/system/daily-issued-summary"
state_root="${STATE_DIRECTORY:-/var/lib/qlmed-daily-summary-catchup}"
safe_env="${OPS_SAFE_ENV:-/home/marce/ops/lib/safe-env.py}"
qlmed_env="${CF_QLMED_ENV_FILE:-/srv/qlmed/env/app.env}"
log_file="${DAILY_SUMMARY_CATCHUP_LOG:-/srv/qlmed/ops/logs/qlmed-daily-summary-catchup.log}"

dry_run=0
[[ "${1:-}" == --dry-run ]] && dry_run=1

install -d -m 0700 "$state_root"
mkdir -p "$(dirname "$log_file")" 2>/dev/null || true

exec 9>"$state_root/catchup.lock"
flock -n 9 || exit 0

log() {
  local line
  line="$(date -u +%Y-%m-%dT%H:%M:%SZ) | $*"
  echo "$line"
  echo "$line" >>"$log_file" 2>/dev/null || true
  logger -t "$tag" -- "$*" 2>/dev/null || true
}

write_status() {
  {
    printf 'checked_at=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf '%s\n' "$@"
  } >"$state_root/status"
  chmod 0600 "$state_root/status"
}

already_sent_today() {
  local want_date=$1
  # Job nativo grava sent_YYYY-MM-DD; versões antigas do catch-up usavam sent-.
  if [[ -f "$state_root/sent_${want_date}" || -f "$state_root/sent-${want_date}" ]]; then
    return 0
  fi
  if [[ -f "$state_root/status" ]] && grep -q "^sent_date=${want_date}$" "$state_root/status"; then
    return 0
  fi
  return 1
}

load_api_key() {
  if [[ -n "${QLMED_API_KEY:-}" ]]; then
    return 0
  fi
  if [[ -r "$qlmed_env" && -x "$safe_env" ]]; then
    local parsed
    parsed=$(mktemp)
    chmod 600 "$parsed"
    if python3 "$safe_env" --file "$qlmed_env" --null --allow QLMED_API_KEY >"$parsed"; then
      local k v
      while IFS= read -r -d '' k && IFS= read -r -d '' v; do
        [[ "$k" == QLMED_API_KEY ]] && QLMED_API_KEY="$v"
      done <"$parsed"
    fi
    rm -f -- "$parsed"
  fi
  [[ -n "${QLMED_API_KEY:-}" ]] || {
    log "ERROR api key unavailable"
    write_status "result=error" "reason=api-key-missing"
    exit 2
  }
}

cg_now() {
  TZ="$tz" date +'%Y-%m-%d %H'
}

trigger_catchup() {
  local body='{}'
  if (( dry_run == 1 )); then
    body='{"dryRun":true}'
  fi
  printf 'header = "Content-Type: application/json"\nheader = "x-api-key: %s"\n' "$QLMED_API_KEY" | curl --config - \
    --fail --silent --show-error --max-time 120 \
    --request POST \
    --data "$body" \
    "$endpoint"
}

# --- main ---
read -r cg_date cg_hour <<<"$(cg_now)"
cg_hour=$((10#$cg_hour))

if (( cg_hour < 18 )); then
  log "SKIP before-window date=$cg_date hour=$cg_hour"
  write_status "result=skip" "reason=before-18h" "cg_date=$cg_date" "cg_hour=$cg_hour"
  exit 0
fi

if already_sent_today "$cg_date"; then
  log "OK already-sent date=$cg_date"
  write_status "result=ok" "reason=already-sent" "cg_date=$cg_date" "sent_date=$cg_date"
  exit 0
fi

load_api_key

if (( dry_run == 1 )); then
  log "DRY-RUN would-trigger date=$cg_date endpoint=$endpoint"
fi

log "CATCHUP trigger date=$cg_date endpoint=$endpoint"
if ! trigger_catchup >/tmp/qlmed-daily-summary-catchup.body 2>/tmp/qlmed-daily-summary-catchup.err; then
  log "ERROR api-failed $(head -c 200 /tmp/qlmed-daily-summary-catchup.err 2>/dev/null || true)"
  write_status "result=error" "reason=api-failed" "cg_date=$cg_date"
  exit 1
fi

if (( dry_run == 1 )); then
  log "OK dry-run-complete date=$cg_date"
  write_status "result=dry-run" "reason=api-ok" "cg_date=$cg_date"
  exit 0
fi

if already_sent_today "$cg_date" || grep -qE '"status"[[:space:]]*:[[:space:]]*"(sent|already_sent)"' /tmp/qlmed-daily-summary-catchup.body 2>/dev/null; then
  printf '%s\n' "$cg_date" >"$state_root/sent_${cg_date}"
  chmod 0600 "$state_root/sent_${cg_date}" || true
  log "OK catchup-sent date=$cg_date"
  write_status "result=ok" "reason=catchup-sent" "cg_date=$cg_date" "sent_date=$cg_date"
  exit 0
fi

if grep -qE '"status"[[:space:]]*:[[:space:]]*"skipped"' /tmp/qlmed-daily-summary-catchup.body 2>/dev/null; then
  log "OK catchup-skipped date=$cg_date"
  write_status "result=ok" "reason=api-skipped" "cg_date=$cg_date"
  exit 0
fi

log "ERROR catchup-unexpected-response date=$cg_date"
write_status "result=error" "reason=unexpected-response" "cg_date=$cg_date"
exit 1
