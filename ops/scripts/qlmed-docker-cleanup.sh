#!/bin/bash
# qlmed-docker-cleanup.sh — higiene de disco do Docker (server QLMED).
# Conservador: só remove imagens DANGLING (untagged) e build cache.
# Logs do Docker já têm rotação (daemon.json: max-size 50m, max-file 5) → não tocamos.
# Cron sugerido: 5 5 * * 0 (domingo 05:05).
set -uo pipefail

source /home/marce/ops/lib/lib-ops.sh

LOG_FILE="/srv/qlmed/ops/logs/qlmed-docker-cleanup.log"
TS=$(date -Iseconds)

BEFORE=$(docker system df --format '{{.Type}} {{.Reclaimable}}' 2>/dev/null | tr '\n' ';')

# Dangling images + build cache (seguro). Volumes NÃO são tocados (dados).
IMG_OUT=$(docker image prune -f 2>&1 | tail -1)
CACHE_OUT=$(docker builder prune -f 2>&1 | tail -1)

# Containers órfãos do MCP terraform: o plugin do Claude Code sobe um por
# sessão (nome aleatório tipo funny_thompson) e nem sempre remove ao sair.
# Remove os criados há mais de 24h — o de uma sessão ativa é sempre recente.
MCP_REMOVED=0
NOW_EPOCH=$(date +%s)
while IFS=$'\t' read -r cid image; do
  case "$image" in hashicorp/terraform-mcp-server*) ;; *) continue ;; esac
  created=$(docker inspect -f '{{.Created}}' "$cid" 2>/dev/null) || continue
  created_epoch=$(date -d "$created" +%s 2>/dev/null) || continue
  if [ $(( NOW_EPOCH - created_epoch )) -gt 86400 ]; then
    docker rm -f "$cid" >/dev/null 2>&1 && MCP_REMOVED=$((MCP_REMOVED+1))
  fi
done < <(docker ps -a --format '{{.ID}}\t{{.Image}}')
echo "$TS | mcp_orphans_removed: $MCP_REMOVED" >> "$LOG_FILE"

AFTER=$(docker system df --format '{{.Type}} {{.Reclaimable}}' 2>/dev/null | tr '\n' ';')

echo "$TS | images: $IMG_OUT | cache: $CACHE_OUT" >> "$LOG_FILE"
echo "$TS | df_before: $BEFORE" >> "$LOG_FILE"
echo "$TS | df_after:  $AFTER" >> "$LOG_FILE"
