#!/usr/bin/env bash
#
# Controlo positivo da guarda de destino do deploy legado (QLMED-OPS-002).
#
# A guarda existe porque `--legacy` nunca reprovou nada: o npm script já
# passava a flag e os defaults apontavam para a produção pública. Um portão
# que só sabe dizer sim é pior do que portão nenhum, então cada recusa é
# provada aqui por reversão, e a aprovação também — senão a guarda poderia
# estar a recusar tudo e ninguém notava.
#
# Nada aqui toca em rede, ssh ou docker: a guarda é sourced e chamada direto.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="$root/scripts/deploy-guard.sh"

run_guard() {
  # subshell: a guarda usa `set -e`, e queremos só o código de saída
  (
    # shellcheck source=scripts/deploy-guard.sh
    . "$guard"
    qlmed_refuse_public_production "$1" "$2" "teste"
  ) >/dev/null 2>&1
}

expect_refuse() {
  local label="$1" dir="$2" url="$3"
  if run_guard "$dir" "$url"; then
    echo "FALHOU: $label deveria RECUSAR e aprovou — a guarda está vacuosa" >&2
    exit 1
  fi
  echo "  ok  $label"
}

expect_allow() {
  local label="$1" dir="$2" url="$3"
  if ! run_guard "$dir" "$url"; then
    echo "FALHOU: $label deveria APROVAR e recusou" >&2
    exit 1
  fi
  echo "  ok  $label"
}

export DEPLOY_CONFIRM=DEPLOY-LEGACY

# Os antigos defaults do script, que era o que `npm run deploy:server` usava.
expect_refuse "raiz de produção pública recusada" \
  /home/marce/qlmed/production http://127.0.0.1:19000/api/health
expect_refuse "alias /srv/qlmed recusado" \
  /srv/qlmed http://127.0.0.1:19000/api/health
expect_refuse "subdiretório de produção recusado" \
  /srv/qlmed/app http://127.0.0.1:19000/api/health
expect_refuse "health público recusado" \
  /home/marce/qlmed/legacy-stack https://app.qlmed.com.br/api/health
expect_refuse "porta pública :13000 recusada" \
  /home/marce/qlmed/legacy-stack http://127.0.0.1:13000/api/health
expect_refuse "DEPLOY_DIR ausente recusado" \
  "" http://127.0.0.1:19000/api/health
expect_refuse "DEPLOY_HEALTHCHECK_URL ausente recusado" \
  /home/marce/qlmed/legacy-stack ""

# Sem a confirmação explícita, nem o destino legado passa.
DEPLOY_CONFIRM=sim expect_refuse "sem DEPLOY_CONFIRM=DEPLOY-LEGACY recusado" \
  /home/marce/qlmed/legacy-stack http://127.0.0.1:19000/api/health

# Controlo negativo: um destino legado legítimo TEM de passar, senão a guarda
# estaria só a recusar tudo.
expect_allow "stack legada com confirmação aprovada" \
  /home/marce/qlmed/legacy-stack http://127.0.0.1:19000/api/health

# O npm script que pré-passava --legacy não pode voltar.
if grep -Eq '"(deploy|rollback):server"' "$root/package.json"; then
  echo "FALHOU: package.json voltou a expor deploy:server/rollback:server" >&2
  exit 1
fi
echo "  ok  package.json sem atalho npm que pré-passa --legacy"

# E o script não pode voltar a BUSCAR a saúde pública: era essa verificação
# que provava que ele publicava produção. (Citar o domínio no texto de ajuda
# é o oposto do problema — é o que manda o operador para o caminho certo.)
if grep -Eq 'curl[^|]*app\.qlmed\.com\.br' "$root/scripts/deploy-server.sh"; then
  echo "FALHOU: deploy-server.sh voltou a consultar app.qlmed.com.br" >&2
  exit 1
fi
echo "  ok  deploy-server.sh não consulta mais o endpoint público"

echo "Deploy guard tests passed."
