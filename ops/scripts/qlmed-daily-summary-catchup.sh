#!/usr/bin/env bash
# qlmed-daily-summary-catchup.sh — reenvia o Resumo Diário se o schedule 18h
# America/Campo_Grande foi perdido (PC desligado / n8n fora no horário).
#
# Idempotente: só dispara o webhook se NÃO houver execução success do
# dailysummaryissued01 no dia local (Campo Grande). Seguro rodar no boot e
# a cada poucos minutos.
#
# Uso:
#   qlmed-daily-summary-catchup.sh           # produção
#   qlmed-daily-summary-catchup.sh --dry-run # só decide, não POST
set -euo pipefail
umask 077

tag=qlmed-daily-summary-catchup
workflow_id=dailysummaryissued01
tz=America/Campo_Grande
n8n_base="${N8N_BASE_URL:-http://127.0.0.1:5678}"
webhook_url="${DAILY_SUMMARY_CATCHUP_WEBHOOK:-$n8n_base/webhook/qlmed-daily-summary-catchup}"
api_v1="${N8N_API_URL:-$n8n_base/api/v1}"
case "$api_v1" in */api/v1) ;; *) api_v1="${api_v1%/}/api/v1" ;; esac

state_root="${STATE_DIRECTORY:-/var/lib/qlmed-daily-summary-catchup}"
safe_env="${OPS_SAFE_ENV:-/home/marce/ops/lib/safe-env.py}"
qlmed_env="${CF_QLMED_ENV_FILE:-/srv/qlmed/env/n8n.env}"
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

load_api_key() {
  if [[ -n "${N8N_API_KEY:-}" ]]; then
    return 0
  fi
  if [[ -r "$qlmed_env" && -x "$safe_env" ]]; then
    local parsed
    parsed=$(mktemp)
    chmod 600 "$parsed"
    if python3 "$safe_env" --file "$qlmed_env" --null --allow N8N_INTERNAL_API_KEY >"$parsed"; then
      local k v
      while IFS= read -r -d '' k && IFS= read -r -d '' v; do
        [[ "$k" == N8N_INTERNAL_API_KEY ]] && N8N_API_KEY="$v"
      done <"$parsed"
    fi
    rm -f -- "$parsed"
  fi
  if [[ -z "${N8N_API_KEY:-}" ]]; then
    N8N_API_KEY="$(docker exec qlmed-n8n printenv N8N_INTERNAL_API_KEY 2>/dev/null || true)"
  fi
  [[ -n "${N8N_API_KEY:-}" ]] || {
    log "ERROR n8n api key unavailable"
    write_status "result=error" "reason=api-key-missing"
    exit 2
  }
}

cg_now() {
  # stdout: YYYY-MM-DD HH
  TZ="$tz" date +'%Y-%m-%d %H'
}

has_success_today() {
  local want_date=$1
  local body
  body=$(printf 'header = "X-N8N-API-KEY: %s"\n' "$N8N_API_KEY" | curl --config - \
    --fail --silent --show-error --max-time 20 \
    "${api_v1}/executions?workflowId=${workflow_id}&status=success&limit=10") || return 2
  WANT_DATE="$want_date" TZ_NAME="$tz" python3 -c '
import json, os, sys
from datetime import datetime
from zoneinfo import ZoneInfo
want = os.environ["WANT_DATE"]
cg = ZoneInfo(os.environ["TZ_NAME"])
data = json.load(sys.stdin).get("data") or []
for e in data:
    ts = e.get("startedAt") or e.get("stoppedAt") or ""
    if not ts:
        continue
    try:
        dt = datetime.fromisoformat(ts.replace("Z", "+00:00")).astimezone(cg)
    except Exception:
        continue
    if dt.strftime("%Y-%m-%d") == want:
        print(e.get("id") or "1")
        raise SystemExit(0)
raise SystemExit(1)
' <<<"$body"
}

n8n_healthy() {
  curl -fsS --max-time 5 "$n8n_base/healthz" >/dev/null 2>&1
}

trigger_catchup() {
  printf 'header = "Content-Type: application/json"\n' | curl --config - \
    --fail --silent --show-error --max-time 120 \
    --request POST \
    --data "{\"source\":\"catchup\",\"reason\":\"missed-schedule\",\"hostBoot\":\"$(who -b 2>/dev/null | awk "{print \$3\" \"\$4}" || true)\"}" \
    "$webhook_url"
}

# --- main ---
read -r cg_date cg_hour <<<"$(cg_now)"
cg_hour=$((10#$cg_hour))

if (( cg_hour < 18 )); then
  log "SKIP before-window date=$cg_date hour=$cg_hour"
  write_status "result=skip" "reason=before-18h" "cg_date=$cg_date" "cg_hour=$cg_hour"
  exit 0
fi

load_api_key

if ! n8n_healthy; then
  log "SKIP n8n-unhealthy date=$cg_date"
  write_status "result=skip" "reason=n8n-unhealthy" "cg_date=$cg_date"
  exit 0
fi

exec_id=""
if exec_id=$(has_success_today "$cg_date"); then
  log "OK already-sent date=$cg_date execution=$exec_id"
  write_status "result=ok" "reason=already-sent" "cg_date=$cg_date" "execution_id=$exec_id"
  exit 0
fi
rc=$?
if (( rc == 2 )); then
  log "ERROR executions-query-failed date=$cg_date"
  write_status "result=error" "reason=executions-query-failed" "cg_date=$cg_date"
  exit 1
fi

if (( dry_run == 1 )); then
  log "DRY-RUN would-trigger date=$cg_date webhook=$webhook_url"
  write_status "result=dry-run" "reason=missing-success" "cg_date=$cg_date"
  exit 0
fi

log "CATCHUP trigger date=$cg_date webhook=$webhook_url"
if ! trigger_catchup >/tmp/qlmed-daily-summary-catchup.body 2>/tmp/qlmed-daily-summary-catchup.err; then
  log "ERROR webhook-failed $(head -c 200 /tmp/qlmed-daily-summary-catchup.err 2>/dev/null || true)"
  write_status "result=error" "reason=webhook-failed" "cg_date=$cg_date"
  exit 1
fi

# Confirma success do dia (pode levar alguns segundos após o 200 do webhook).
for _ in 1 2 3 4 5; do
  if exec_id=$(has_success_today "$cg_date"); then
    log "OK catchup-sent date=$cg_date execution=$exec_id"
    write_status "result=ok" "reason=catchup-sent" "cg_date=$cg_date" "execution_id=$exec_id"
    exit 0
  fi
  sleep 2
done

log "ERROR catchup-no-success-after-trigger date=$cg_date"
write_status "result=error" "reason=no-success-after-trigger" "cg_date=$cg_date"
exit 1
