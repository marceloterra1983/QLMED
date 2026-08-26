#!/usr/bin/env bash
#
# Teste do portão de endurecimento do CI.
#
# O portão vigia o ci.yml, mas nada vigiava o portão: apagar uma asserção
# deixava-o silenciosamente vacuoso. Este teste exige que CADA regra reprove o
# workflow que ela existe para reprovar — verificação por reversão, e não por
# leitura.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
guard="$root/scripts/verify-ci-hardening.sh"
workflow_rel=".github/workflows/ci.yml"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

# Réplica mínima do repositório: o portão lê caminhos relativos ao diretório
# corrente, então cada caso roda numa cópia isolada.
setup_case() {
  local case_dir="$1"
  mkdir -p "$case_dir/.github/workflows"
  cp "$root/$workflow_rel" "$case_dir/$workflow_rel"
  cp "$root/package.json" "$case_dir/package.json"
}

expect_pass() {
  local case_dir="$1" label="$2"
  if ! (cd "$case_dir" && bash "$guard" >/dev/null 2>&1); then
    echo "FALHOU: $label deveria PASSAR e reprovou" >&2
    exit 1
  fi
  echo "  ok  $label"
}

expect_fail() {
  local case_dir="$1" label="$2"
  if (cd "$case_dir" && bash "$guard" >/dev/null 2>&1); then
    echo "FALHOU: $label deveria REPROVAR e passou — a regra está vacuosa" >&2
    exit 1
  fi
  echo "  ok  $label"
}

# 1. O workflow real, como está no repositório, precisa passar.
setup_case "$tmp/atual"
expect_pass "$tmp/atual" "workflow vigente passa"

# 2. CI apontado para o host de produção precisa reprovar. Esta é a regra que
#    um agente tentou remover em 26/08; se ela ficar vacuosa, o CI passa a
#    poder rodar npm ci na máquina do banco fiscal.
setup_case "$tmp/qlmed_prod"
sed -i 's/runs-on: ubuntu-24\.04/runs-on: [self-hosted, qlmed-prod]/' "$tmp/qlmed_prod/$workflow_rel"
expect_fail "$tmp/qlmed_prod" "runs-on apontando para qlmed-prod reprova"

# 3. Qualquer self-hosted reprova enquanto não houver runner isolado — hoje
#    self-hosted significa qlmed-prod.
setup_case "$tmp/self_hosted"
sed -i 's/runs-on: ubuntu-24\.04/runs-on: self-hosted/' "$tmp/self_hosted/$workflow_rel"
expect_fail "$tmp/self_hosted" "runs-on self-hosted genérico reprova"

# 4. Postgres do CI divergindo da produção reprova.
setup_case "$tmp/pg16"
sed -i 's/postgres:18-alpine/postgres:16/' "$tmp/pg16/$workflow_rel"
expect_fail "$tmp/pg16" "serviço postgres:16 reprova"

# 5. Typecheck declarado mas não executado deixa o portão vacuoso.
setup_case "$tmp/sem_run"
sed -i 's/run: npm run typecheck/run: echo pulando typecheck/' "$tmp/sem_run/$workflow_rel"
expect_fail "$tmp/sem_run" "typecheck não executado no workflow reprova"

# 6. Typecheck executado mas não declarado, o inverso do caso 5.
setup_case "$tmp/sem_script"
sed -i 's/"typecheck": "tsc --noEmit"/"typecheck": "echo skip"/' "$tmp/sem_script/package.json"
expect_fail "$tmp/sem_script" "script typecheck adulterado reprova"

# 7. O caso que expôs o furo em 26/08: um job self-hosted ACRESCENTADO, com os
#    ubuntu-24.04 existentes intactos. Antes da correção o portão aprovava,
#    porque `! grep` não aborta sob `set -e` e quem reprovava era, por acidente,
#    a asserção positiva de ubuntu-24.04.
setup_case "$tmp/job_extra"
printf '\n  job-extra:\n    runs-on: [self-hosted, qlmed-prod]\n    steps:\n      - run: echo oi\n' \
  >> "$tmp/job_extra/$workflow_rel"
expect_fail "$tmp/job_extra" "job self-hosted acrescentado reprova (ubuntu-24.04 intacto)"

echo "CI hardening guard tests passed."
