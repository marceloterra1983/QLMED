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

setup_case() {
  local case_dir="$1"
  mkdir -p "$case_dir/.github/workflows"
  cp "$root/.github/workflows/"*.yml "$case_dir/.github/workflows/"
  cp "$root/package.json" "$case_dir/package.json"
}

expect_pass() {
  local case_dir="$1" label="$2"
  if ! (cd "$case_dir" && bash "$guard" >/dev/null 2>&1); then
    echo "FALHOU: $label deveria PASSAR e reprovou" >&2
    (cd "$case_dir" && bash "$guard") || true
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

append_job() {
  local file="$1"
  cat >> "$file"
}

# 1. O workflow real, como está no repositório, precisa passar.
setup_case "$tmp/atual"
expect_pass "$tmp/atual" "workflow vigente passa"

# 2. CI apontado para o host de produção precisa reprovar. FR-007 / reversão.
setup_case "$tmp/qlmed_prod"
append_job "$tmp/qlmed_prod/$workflow_rel" <<'EOF'

  job-extra:
    runs-on: [self-hosted, qlmed-prod]
    steps:
      - run: echo oi
EOF
expect_fail "$tmp/qlmed_prod" "job extra apontando para qlmed-prod reprova"

# 3. runs-on só com self-hosted continua proibido (AND demasiado largo).
setup_case "$tmp/self_hosted"
append_job "$tmp/self_hosted/$workflow_rel" <<'EOF'

  job-extra:
    runs-on: self-hosted
    steps:
      - run: echo oi
EOF
expect_fail "$tmp/self_hosted" "runs-on self-hosted genérico reprova"

# 4. Fallback hospedado reprova.
setup_case "$tmp/hosted"
append_job "$tmp/hosted/$workflow_rel" <<'EOF'

  job-extra:
    runs-on: ubuntu-24.04
    steps:
      - run: echo oi
EOF
expect_fail "$tmp/hosted" "ubuntu-24.04 em ci.yml reprova"

# 5. Service container (socket de engine) reprova.
setup_case "$tmp/services"
append_job "$tmp/services/$workflow_rel" <<'EOF'

  job-extra:
    runs-on:
      - self-hosted
      - pb-linux
      - pb-x64
      - pb-docs
      - pb-python
      - pb-shell
      - pb-powershell
      - pb-dotnet
      - pb-node
      - pb-validation
      - pb-build
      - pb-persistent
    services:
      postgres:
        image: postgres:16
    steps:
      - run: echo oi
EOF
expect_fail "$tmp/services" "service container postgres reprova"

# 6. Typecheck declarado mas não executado deixa o portão vacuoso.
setup_case "$tmp/sem_run"
sed -i 's/run: npm run typecheck/run: echo pulando typecheck/' "$tmp/sem_run/$workflow_rel"
expect_fail "$tmp/sem_run" "typecheck não executado no workflow reprova"

# 7. Typecheck executado mas não declarado, o inverso do caso 6.
setup_case "$tmp/sem_script"
sed -i 's/"typecheck": "tsc --noEmit"/"typecheck": "echo skip"/' "$tmp/sem_script/package.json"
expect_fail "$tmp/sem_script" "script typecheck adulterado reprova"

# 8. DATABASE_URL no loopback do job (serviço antigo) reprova.
setup_case "$tmp/loopback"
sed -i 's@qlmed-ci-db:5432@127.0.0.1:5433@' "$tmp/loopback/$workflow_rel"
expect_fail "$tmp/loopback" "DATABASE_URL em 127.0.0.1:5433 reprova"

# 9. Evento proibido reprova.
setup_case "$tmp/pr_target"
sed -i '/^on:/a\  pull_request_target:' "$tmp/pr_target/$workflow_rel"
expect_fail "$tmp/pr_target" "pull_request_target reprova"

# 10. deploy-production.yml sem qlmed-prod reprova (FR-005).
setup_case "$tmp/deploy_drift"
sed -i 's/qlmed-prod/self-hosted/' "$tmp/deploy_drift/.github/workflows/deploy-production.yml"
expect_fail "$tmp/deploy_drift" "deploy-production.yml sem qlmed-prod reprova"

# 11..15. Filtro de caminhos sem a superfície operacional reprova
# (QLMED-OPS-001). Um por padrão: um portão que só sabe dizer sim, quando
# alguém apaga uma linha do filtro, é pior do que portão nenhum.
for filter_path in "ops/\*\*" "production/\*\*" "docker-compose.yml" ".github/dependabot.yml" ".github/workflows/\*\*"; do
  case_name="filtro_$(printf '%s' "$filter_path" | tr -c 'a-zA-Z0-9' '_')"
  setup_case "$tmp/$case_name"
  sed -i "\@^ *- '${filter_path}'\$@d" "$tmp/$case_name/$workflow_rel"
  expect_fail "$tmp/$case_name" "filtro app sem ${filter_path//\\/} reprova"
done

echo "CI hardening guard tests passed."
