#!/bin/bash
# qlmed-evolution-smart-restart.sh — restart inteligente da Evolution API (server QLMED).
# Adaptado do charlie. Só reinicia se mem > THRESHOLD_MB (baseline ~255MiB → threshold 600).
set -uo pipefail

# Phase 08/SCH-02 (server-wide-hardening-v2): prevent overlapping runs if a
# prior invocation hangs past the hourly interval.
exec 9>"/run/lock/$(basename "$0").lock"
flock -n 9 || exit 0

source /home/marce/ops/lib/lib-ops.sh

THRESHOLD_MB=600
LOG_FILE="/srv/qlmed/ops/logs/qlmed-evolution-restart.log"

# Prefer the stable compose name; fall back to the old swarm-style suffix.
CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^qlmed-evolution-api$' | head -1)
if [ -z "$CONTAINER" ]; then
  CONTAINER=$(docker ps --format '{{.Names}}' | grep -E '^qlmed-evolution-api-[a-z0-9]{20,}-[0-9]+$' | head -1)
fi

TS=$(date -Iseconds)
HOUR=$(date +%H:%M)

# Memory restart is best-effort. WhatsApp session watch below MUST still run
# even if the container name drifted — otherwise SONDA 10 stays blind.
if [ -z "$CONTAINER" ]; then
  echo "$TS | Evolution API container não encontrado (mem-check skipped; WA watch continues)" >> "$LOG_FILE"
else
  MEM_RAW=$(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER" 2>/dev/null)
  MEM_MIB=$(echo "$MEM_RAW" | grep -oP '[\d.]+' | head -1)
  MEM_INT=$(printf "%.0f" "$MEM_MIB" 2>/dev/null || echo "0")

  if [ "$MEM_INT" -ge "$THRESHOLD_MB" ]; then
    echo "$TS | RESTART | mem=${MEM_MIB}MiB (threshold=${THRESHOLD_MB}MB) | restarting..." >> "$LOG_FILE"
    docker restart "$CONTAINER" >> "$LOG_FILE" 2>&1
    sleep 10
    NEW_MEM=$(docker stats --no-stream --format '{{.MemUsage}}' "$CONTAINER" 2>/dev/null)
    echo "$TS | RESTART COMPLETE | before=${MEM_MIB}MiB after=${NEW_MEM}" >> "$LOG_FILE"
    MSG="🔄 Evolution API (server) — Restart Inteligente

🕐 ${HOUR}
💾 Memória antes: ${MEM_MIB} MiB (threshold: ${THRESHOLD_MB} MB)
💾 Memória depois: ${NEW_MEM}
✅ Container reiniciado com sucesso"
    wa_send "$MSG" || echo "$TS | FALHA ao notificar restart" >> "$LOG_FILE"
  else
    # Log esparso (1x a cada 6h) pra não inflar o arquivo.
    HOUR_NUM=$(date +%H)
    if [ "$(( 10#$HOUR_NUM % 6 ))" -eq 0 ]; then
      echo "$TS | OK | mem=${MEM_MIB}MiB (threshold=${THRESHOLD_MB}MB)" >> "$LOG_FILE"
    fi
  fi
fi

# --- Watchdog de sessão WhatsApp (QLMED + AutomatizeMS) ---
# Restart não cobre device_removed/logout (401): a sessão fica "close" com o
# container saudável e nenhum outro monitor percebe (incidente de 04-08/07/2026,
# 3 dias sem notificação WA). Alerta por E-MAIL porque o WhatsApp é justamente
# o canal que caiu. Anti-spam: alerta na transição e re-alerta a cada 6h.
REALERT_SECONDS=21600

# wa_watch <label> <instance> <owner_number> <state> <state_file> [nota_extra]
wa_watch() {
  local label="$1" instance="$2" owner="$3" state="$4" state_file="$5" extra="${6:-}"
  local prev_line prev_state last_alert now_epoch
  prev_line=$(cat "$state_file" 2>/dev/null || echo "open|0")
  prev_state="${prev_line%%|*}"
  last_alert="${prev_line##*|}"
  case "$last_alert" in ''|*[!0-9]*) last_alert=0 ;; esac
  now_epoch=$(date +%s)

  if [ "$state" != "open" ]; then
    if [ "$prev_state" = "open" ] || [ $(( now_epoch - last_alert )) -ge "$REALERT_SECONDS" ]; then
      echo "$TS | WA SESSION DOWN [$label] | state=$state (antes: $prev_state) | alertando por e-mail" >> "$LOG_FILE"
      email_send "⚠️ $label: sessão WhatsApp caiu (state=$state)" \
"A instância $instance está com state=$state em $TS.

Envios por WhatsApp desse canal NÃO estão saindo.${extra}

Se for device_removed/logout (401), restart não resolve: é preciso parear de novo.
Gerar o pairing code SÓ com o usuário já na tela de digitação (o código expira em ~30s):
  GET /instance/connect/$instance?number=$owner
  (WhatsApp > Dispositivos conectados > Conectar dispositivo > Conectar com número de telefone)

Este alerta se repete a cada 6h enquanto a sessão não voltar." \
        || echo "$TS | FALHA ao enviar e-mail de alerta WA [$label]" >> "$LOG_FILE"
      echo "$state|$now_epoch" > "$state_file"
    else
      echo "$TS | WA SESSION STILL DOWN [$label] | state=$state" >> "$LOG_FILE"
      echo "$state|$last_alert" > "$state_file"
    fi
  else
    if [ "$prev_state" != "open" ]; then
      echo "$TS | WA SESSION RESTORED [$label]" >> "$LOG_FILE"
      email_send "✅ $label: sessão WhatsApp restaurada" \
"A instância $instance voltou para state=open em $TS.${extra}" \
        || echo "$TS | FALHA ao enviar e-mail de recuperação WA [$label]" >> "$LOG_FILE"
    fi
    echo "open|0" > "$state_file"
  fi
}

# QLMED (porta 8085; creds do nfe-notify/.env via lib-ops.sh)
QLMED_WA_STATE=$(curl -s --max-time 15 -H "apikey: ${EVO_API_KEY:-}" \
  "$EVO_API_URL/instance/connectionState/$EVO_INSTANCE" 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["instance"]["state"])' 2>/dev/null) || QLMED_WA_STATE=""
wa_watch "QLMED" "$EVO_INSTANCE" "556799233899" "${QLMED_WA_STATE:-unreachable}" \
  "/srv/qlmed/ops/state/.evolution-wa-state" \
  "
Notificações de NF-e/CT-e ficam 'uncertain' no outbox (sem retry automático);
após reconectar: UPDATE \"NotificationDelivery\" SET status='retry', \"availableAt\"=now(),
\"lockedAt\"=null, \"lockToken\"=null, \"submittingAt\"=null WHERE status='uncertain';
e rodar o notification-outbox-worker.py."

# Shared (ex-charlie/AutomatizeMS; sem porta publicada no host — via docker exec).
# Container renomeado shared-evolution-api → evolution-api em
# 2026-07-16; o nome antigo deixava o watchdog cego (state=unreachable).
AMS_STATE=$(docker exec evolution-api sh -c \
  'wget -qO- --timeout=15 --header="apikey: $AUTHENTICATION_API_KEY" http://127.0.0.1:8080/instance/connectionState/meu-whatsapp' 2>/dev/null \
  | python3 -c 'import sys,json; print(json.load(sys.stdin)["instance"]["state"])' 2>/dev/null) || AMS_STATE=""
wa_watch "AutomatizeMS" "meu-whatsapp" "556791908000" "${AMS_STATE:-unreachable}" \
  "/srv/qlmed/ops/state/.evolution-wa-state-automatizems"
