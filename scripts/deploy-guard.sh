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

  # Normaliza antes de comparar. O guarda comparava strings cruas, então
  # `//srv/qlmed`, `/srv//qlmed`, `/srv/./qlmed` e um caminho relativo eram o
  # MESMO inode e passavam todos. Achado da re-auditoria adversarial.
  local canonical_dir
  canonical_dir="$(cd "$deploy_dir" 2>/dev/null && pwd -P)" || canonical_dir=""
  if [[ -z "$canonical_dir" ]]; then
    # Diretório inexistente ainda tem de ser julgado: recusar por não existir
    # seria falso negativo no dia em que ele existir.
    canonical_dir="$deploy_dir"
    [[ "$canonical_dir" != /* ]] && canonical_dir="$PWD/$canonical_dir"
  fi
  # Colapsa SEMPRE, inclusive depois do `pwd -P`: o POSIX permite ao shell
  # preservar duas barras iniciais, e `//srv/qlmed` voltava intacto de `pwd -P`
  # — era o caso que continuava a passar.
  while [[ "$canonical_dir" == *"//"* ]]; do canonical_dir="${canonical_dir//\/\///}"; done
  while [[ "$canonical_dir" == *"/./"* ]]; do canonical_dir="${canonical_dir//\/.\///}"; done
  canonical_dir="${canonical_dir%/}"
  [[ -z "$canonical_dir" ]] && canonical_dir="/"

  local root
  for root in "${QLMED_PUBLIC_PRODUCTION_ROOTS[@]}"; do
    if [[ "$canonical_dir" == "$root" || "$canonical_dir" == "$root"/* ]]; then
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

  # Hostname não distingue caixa: `APP.QLMED.COM.BR` é o mesmo endpoint.
  local lower_url
  lower_url="$(printf '%s' "$healthcheck_url" | tr '[:upper:]' '[:lower:]')"

  local pattern
  for pattern in "${QLMED_PUBLIC_ENDPOINT_PATTERNS[@]}"; do
    if [[ "$lower_url" == *"$pattern"* ]]; then
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
