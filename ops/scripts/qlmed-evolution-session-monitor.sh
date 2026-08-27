#!/usr/bin/env bash
# Read-only QLMED Evolution session monitor.
# It checks HTTP + connectionState, alerts by e-mail after two consecutive
# failures, and never restarts, disconnects or re-pairs a session. Exit 1 is
# session unavailable; exit 2 is an internal or alert-transport failure.
set -euo pipefail
umask 077

mode=${1:---check}
if [[ "$mode" == "--fixture" ]]; then
  [[ $# -eq 2 ]] || { echo 'usage: --fixture PATH' >&2; exit 2; }
  export QLMED_EVOLUTION_MONITOR_FIXTURE="$2"
  mode=--check
fi
[[ "$mode" == "--check" ]] || { echo 'usage: --check or --fixture PATH' >&2; exit 2; }

state_dir=${QLMED_EVOLUTION_STATE_DIR:-${STATE_DIRECTORY:-/var/lib/qlmed-evolution-session-monitor}}
state_file=${QLMED_EVOLUTION_STATE_FILE:-$state_dir/state}
log_file=${QLMED_EVOLUTION_LOG_FILE:-${LOGS_DIRECTORY:-/var/log/qlmed-evolution-session-monitor}/monitor.log}
realert_seconds=${QLMED_EVOLUTION_REALERT_SECONDS:-21600}
now_epoch=$(date +%s)
checked_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)

install -d -m 0700 "$state_dir" "$(dirname "$log_file")"
touch "$log_file"
chmod 0600 "$log_file"
exec 9>"$state_dir/monitor.lock"
flock -n 9 || exit 0

# Only fixed, sanitized status values are persisted or logged. API responses,
# URLs, credentials and recipient addresses never enter state or logs.
log_event() {
  local event="$1"
  printf 'checked_at=%s event=%s\n' "$checked_at" "$event" >>"$log_file"
  chmod 0600 "$log_file"
  if command -v logger >/dev/null 2>&1; then
    logger -t qlmed-evolution-session-monitor -- "event=$event"
  fi
}

write_state() {
  local status="$1" failures="$2" alerted="$3" last_alert="$4" pending="$5" reason="$6"
  local tmp="$state_file.tmp.$$"
  {
    printf 'status=%s\n' "$status"
    printf 'consecutive_failures=%s\n' "$failures"
    printf 'outage_alerted=%s\n' "$alerted"
    printf 'last_alert_epoch=%s\n' "$last_alert"
    printf 'recovery_pending=%s\n' "$pending"
    printf 'reason=%s\n' "$reason"
    printf 'checked_at=%s\n' "$checked_at"
  } >"$tmp"
  chmod 0600 "$tmp"
  mv -f -- "$tmp" "$state_file"
}

prev_status=open
prev_failures=0
prev_alerted=0
prev_last_alert=0
prev_recovery_pending=0
if [[ -r "$state_file" ]]; then
  while IFS='=' read -r key value; do
    case "$key" in
      status) prev_status="$value" ;;
      consecutive_failures) prev_failures="$value" ;;
      outage_alerted) prev_alerted="$value" ;;
      last_alert_epoch) prev_last_alert="$value" ;;
      recovery_pending) prev_recovery_pending="$value" ;;
    esac
  done <"$state_file"
fi
case "$prev_failures" in ''|*[!0-9]*) prev_failures=0 ;; esac
case "$prev_last_alert" in ''|*[!0-9]*) prev_last_alert=0 ;; esac
case "$prev_alerted" in 0|1) ;; *) prev_alerted=0 ;; esac
case "$prev_recovery_pending" in 0|1) ;; *) prev_recovery_pending=0 ;; esac

ops_lib=${OPS_LIB:-/home/marce/ops/lib/lib-ops.sh}
alert_transport=unavailable
alert_transport_reason=not_configured
if [[ -f "$ops_lib" ]]; then
  if source "$ops_lib" 2>/dev/null && declare -F email_send >/dev/null 2>&1; then
    alert_transport=available
    alert_transport_reason=ready
  else
    alert_transport_reason=load_failed
  fi
else
  alert_transport_reason=helper_missing
fi

probe_status=unreachable
probe_reason=config_missing

probe_fixture() {
  local fixture="$1"
  [[ -r "$fixture" ]] || { probe_reason=fixture_missing; return; }
  local result
  result=$(python3 - "$fixture" <<'PY'
import json
import sys

try:
    payload = json.load(open(sys.argv[1], encoding="utf-8"))
except Exception:
    print("unreachable|fixture_invalid")
    raise SystemExit

if payload.get("kind") == "unreachable":
    print("unreachable|http_unreachable")
    raise SystemExit
if payload.get("http_status") != 200:
    print("unreachable|http_unreachable")
    raise SystemExit
state = payload.get("connection_state")
if state == "open":
    print("open|connection_open")
elif state == "close":
    print("close|connection_close")
else:
    print("unreachable|connection_state_invalid")
PY
  )
  IFS='|' read -r probe_status probe_reason <<<"$result"
}

probe_live() {
  local api_url=${QLMED_EVOLUTION_API_URL:-${EVO_API_URL:-}}
  local instance=${QLMED_EVOLUTION_INSTANCE:-${EVO_INSTANCE:-}}
  local api_key=${EVO_API_KEY:-}
  [[ -n "$api_url" && -n "$instance" && -n "$api_key" ]] || return 0

  local header_file root_status conn_file conn_status state
  header_file=$(mktemp)
  conn_file=$(mktemp)
  chmod 0600 "$header_file" "$conn_file"
  printf 'apikey: %s\n' "$api_key" >"$header_file"
  root_status=$(curl -sS --max-time 15 -o /dev/null -w '%{http_code}' "$api_url/" 2>/dev/null || printf '000')
  if [[ ! "$root_status" =~ ^2 ]]; then
    rm -f -- "$header_file" "$conn_file"
    probe_reason=http_unreachable
    return 0
  fi
  conn_status=$(curl -sS --max-time 15 -o "$conn_file" -w '%{http_code}' \
    -H @"$header_file" "$api_url/instance/connectionState/$instance" 2>/dev/null || printf '000')
  if [[ ! "$conn_status" =~ ^2 ]]; then
    rm -f -- "$header_file" "$conn_file"
    probe_reason=connection_unreachable
    return 0
  fi
  state=$(python3 - "$conn_file" <<'PY'
import json
import sys

try:
    data = json.load(open(sys.argv[1], encoding="utf-8"))
    state = data.get("instance", {}).get("state") or data.get("state")
except Exception:
    state = None
print(state if state in {"open", "close"} else "invalid")
PY
  )
  rm -f -- "$header_file" "$conn_file"
  case "$state" in
    open) probe_status=open; probe_reason=connection_open ;;
    close) probe_status=close; probe_reason=connection_close ;;
    *) probe_status=unreachable; probe_reason=connection_state_invalid ;;
  esac
}

if [[ -n "${QLMED_EVOLUTION_MONITOR_FIXTURE:-}" ]]; then
  probe_fixture "$QLMED_EVOLUTION_MONITOR_FIXTURE"
else
  probe_live
fi

send_alert() {
  local subject="$1" body="$2" recipient=${QLMED_EVOLUTION_ALERT_TO:-}
  [[ "${QLMED_EVOLUTION_MONITOR_NO_ALERT:-}" == 1 ]] && return 0
  [[ "$alert_transport" == available ]] || return 1
  if [[ -n "$recipient" ]]; then
    email_send "$subject" "$body" "$recipient"
  else
    email_send "$subject" "$body"
  fi
}

if [[ "$probe_status" == open ]]; then
  if [[ "$prev_alerted" == 1 || "$prev_recovery_pending" == 1 ]]; then
    if send_alert \
      'QLMED Evolution session recovered' \
      'The QLMED Evolution HTTP and connectionState checks recovered to open.'; then
      log_event recovery_alert_sent
      write_state open 0 0 0 0 connection_open
    else
      log_event recovery_alert_failed
      write_state open 0 "$prev_alerted" "$prev_last_alert" 1 alert_transport_failed
      log_event monitor_failure_alert_transport
      log_event status_open
      exit 2
    fi
  else
    write_state open 0 0 0 0 connection_open
  fi
  log_event status_open
  exit 0
fi

failures=$((prev_failures + 1))
alerted=$prev_alerted
last_alert=$prev_last_alert
alert_failure=0
if (( failures >= 2 )) && { [[ "$alerted" == 0 ]] || (( now_epoch - last_alert >= realert_seconds )); }; then
  if send_alert \
    'QLMED Evolution session down' \
    "The QLMED Evolution HTTP or connectionState check is unhealthy (reason=$probe_reason)."; then
    alerted=1
    last_alert=$now_epoch
    log_event down_alert_sent
  else
    log_event down_alert_failed
    alert_failure=1
  fi
fi
if (( alert_failure )); then
  write_state "$probe_status" "$failures" "$alerted" "$last_alert" "$prev_recovery_pending" alert_transport_failed
  log_event monitor_failure_alert_transport
  log_event "status=$probe_status"
  exit 2
fi
write_state "$probe_status" "$failures" "$alerted" "$last_alert" "$prev_recovery_pending" "$probe_reason"
log_event "status=$probe_status"
exit 1
