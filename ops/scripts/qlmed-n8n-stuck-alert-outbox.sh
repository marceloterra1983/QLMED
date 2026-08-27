#!/usr/bin/env bash
# Consome outbox.jsonl do stuck-watchdog QLMED e alerta no WhatsApp (dedupe por offset).
# Uso: qlmed-n8n-stuck-alert-outbox.sh /path/to/outbox.jsonl
set -euo pipefail
OUTBOX="${1:?outbox.jsonl}"
STATE_DIR="$(dirname "$OUTBOX")"
OFFSET_FILE="$STATE_DIR/outbox.offset"
source /home/marce/ops/claude-fix/lib.sh 2>/dev/null || source /home/marce/ops/claude-fix/lib.sh
source /home/marce/.claude/secrets.env 2>/dev/null || true

offset=0
[[ -f "$OFFSET_FILE" ]] && offset=$(cat "$OFFSET_FILE" 2>/dev/null || echo 0)
[[ "$offset" =~ ^[0-9]+$ ]] || offset=0

mapfile -t lines < <(tail -c +"$((offset+1))" "$OUTBOX" 2>/dev/null || true)
[[ ${#lines[@]} -eq 0 ]] && exit 0

new_offset=$offset
for line in "${lines[@]}"; do
  [[ -z "${line// }" ]] && { new_offset=$((new_offset + ${#line} + 1)); continue; }
  event=$(printf '%s' "$line" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("event",""))' 2>/dev/null || true)
  wid=$(printf '%s' "$line" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("workflowId",""))' 2>/dev/null || true)
  eid=$(printf '%s' "$line" | python3 -c 'import sys,json; print(json.load(sys.stdin).get("executionId",""))' 2>/dev/null || true)
  case "$event" in
    stuck)
      send_whatsapp "🚨 *Watchdog QLMED n8n* — execução presa\nWorkflow: \`${wid}\`\nExecução: #${eid}\nhttps://n8n.qlmed.com.br/workflow/${wid}/executions/${eid}" >/dev/null || true
      ;;
    escalation)
      send_whatsapp "⚠️ *Watchdog QLMED n8n* — execução ainda presa (escalation)\nWorkflow: \`${wid}\`\nExecução: #${eid}" >/dev/null || true
      ;;
    recovery)
      send_whatsapp "✅ *Watchdog QLMED n8n* — execução recuperou\nWorkflow: \`${wid}\`\nExecução: #${eid}" >/dev/null || true
      ;;
    watchdog_error)
      send_whatsapp "🚨 *Watchdog QLMED n8n* — falha ao consultar API de execuções (qlmed-n8n)." >/dev/null || true
      ;;
  esac
  new_offset=$((new_offset + ${#line} + 1))
done
printf '%s\n' "$new_offset" >"$OFFSET_FILE"
chmod 600 "$OFFSET_FILE" 2>/dev/null || true
