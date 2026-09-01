#!/usr/bin/env bash
#
# Guarda dos scripts de compose legado/manual (`deploy-server.sh`,
# `rollback-server.sh`). Não executa nada: é para ser SOURCED.
#
# Motivo (auditoria b177b07, QLMED-OPS-002): os dois scripts nasceram com
# `--legacy` como se fosse um portão, mas o `package.json` já passava a flag
# (`"deploy:server": "bash ./scripts/deploy-server.sh --legacy"`) e os defaults
# apontavam para a raiz de produção pública (`/home/marce/qlmed/production`,
# alias de `/srv/qlmed`), porta `13000` e verificação final em
# `https://app.qlmed.com.br/api/health`. Ou seja: um `npm run deploy:server` de
# qualquer branch fazia `up -d --build` na stack pública e só declarava sucesso
# depois de o site público servir aquele commit — contornando por inteiro o
# caminho fail-closed (`deploy-production.yml`: workflow_dispatch manual, SHA
# fixado, CI verde no mesmo SHA, janela de migração, rollback de imagem).
#
# A flag `--legacy` continua a existir, mas deixou de ser a única condição.
set -euo pipefail

# Raízes de produção pública. `/srv/qlmed` e `/home/marce/qlmed/production` são
# o MESMO diretório (alias documentado em docs/deployment/qlmed-app.md).
QLMED_PUBLIC_PRODUCTION_ROOTS=(
  /srv/qlmed
  /home/marce/qlmed/production
)

# Endereços que só a stack pública serve: o domínio e a porta que o
# `production/docker-compose.yml` publica para o `qlmed-app`.
QLMED_PUBLIC_ENDPOINT_PATTERNS=(
  'app.qlmed.com.br'
  ':13000'
)

qlmed_refuse_public_production() {
  local deploy_dir="${1:-}"
  local healthcheck_url="${2:-}"
  local script_name="${3:-este script}"

  if [[ -z "$deploy_dir" ]]; then
    echo "DEPLOY_DIR não definido. ${script_name} não tem mais destino padrão:" >&2
    echo "  o antigo padrão era a raiz de produção pública." >&2
    return 1
  fi

  local root
  for root in "${QLMED_PUBLIC_PRODUCTION_ROOTS[@]}"; do
    if [[ "$deploy_dir" == "$root" || "$deploy_dir" == "$root"/* ]]; then
      echo "Recusado: DEPLOY_DIR=${deploy_dir} é a raiz de produção pública." >&2
      echo "Produção pública só sai por 'gh workflow run deploy-production.yml'" >&2
      echo "(workflow_dispatch manual, com CI verde no SHA de origin/main)." >&2
      return 1
    fi
  done

  if [[ -z "$healthcheck_url" ]]; then
    echo "DEPLOY_HEALTHCHECK_URL não definido. ${script_name} não tem mais" >&2
    echo "  padrão: o antigo apontava para a porta pública :13000." >&2
    return 1
  fi

  local pattern
  for pattern in "${QLMED_PUBLIC_ENDPOINT_PATTERNS[@]}"; do
    if [[ "$healthcheck_url" == *"$pattern"* ]]; then
      echo "Recusado: DEPLOY_HEALTHCHECK_URL=${healthcheck_url} aponta para a" >&2
      echo "stack pública (${pattern}). ${script_name} não publica produção." >&2
      return 1
    fi
  done

  if [[ "${DEPLOY_CONFIRM:-}" != "DEPLOY-LEGACY" ]]; then
    echo "Recusado: exporte DEPLOY_CONFIRM=DEPLOY-LEGACY para confirmar que" >&2
    echo "o alvo é a stack legada/manual, e não a produção pública." >&2
    return 1
  fi

  return 0
}
