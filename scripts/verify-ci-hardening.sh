#!/usr/bin/env bash
#
# Portão de endurecimento do CI. Cada asserção abaixo é uma DECISÃO, não uma
# convenção acidental — foram introduzidas na remediação de auditoria de
# 2026-08-17 (commit b0acd0e).
#
# O motivo de haver comentários aqui: em 2026-08-26 um agente leu as asserções
# nuas, concluiu que eram resíduo desatualizado e propôs "atualizar a política"
# para acomodar uma mudança que ela existia para impedir. O portão reprovou e
# a mudança foi revertida — mas a leitura errada custou tempo e quase desarmou
# um controle de segurança. Asserção sem motivo declarado convida a isso.
#
# Alterar qualquer regra daqui exige spec, conforme AGENTS.md.
set -euo pipefail

workflow=".github/workflows/ci.yml"
package="package.json"

test -f "$workflow"
test -f "$package"

# ── O CI NÃO roda no host de produção ────────────────────────────────────────
# O CI executa `npm ci`, que roda scripts de instalação de centenas de pacotes.
# Em runner hospedado isso ocorre numa VM descartável. No runner `qlmed-prod`
# ocorreria como usuário `marce`, na máquina que hospeda o banco fiscal, o n8n,
# as credenciais e os backups — com acesso ao grupo `docker`, que é root na
# prática. Uma dependência comprometida teria caminho direto para produção.
#
# `deploy-production.yml` USA `qlmed-prod`, e corretamente: precisa tocar a
# máquina, roda só por dispatch manual com SHA fixado, e não instala
# dependências vindas de pull request. A distinção é essa, não a palavra.
#
# Evolução prevista: SPEC-013 propõe permitir um runner ISOLADO (container, uid
# não privilegiado, sem socket de container, rede própria) e manter a proibição
# do host de produção. Enquanto esse runner não existir, apontar o CI para
# qualquer label self-hosted significa `qlmed-prod`, então a regra segue ampla.
# `! grep` NÃO aborta sob `set -e` — bash documenta que a negação suprime o
# ERR. Por isso a proibição é escrita como `if grep; then fail; fi`, que aborta
# de verdade. As duas proibições deste arquivo estiveram vacuosas de 2026-08-17
# a 2026-08-26 exatamente por esse motivo.
if grep -Eq 'self-hosted|qlmed-prod' "$workflow"; then
  echo "CI hardening: ci.yml não pode usar runner self-hosted (host de produção)" >&2
  exit 1
fi
grep -q 'ubuntu-24\.04' "$workflow"

# ── O serviço de banco do CI acompanha a produção ────────────────────────────
# Produção roda PostgreSQL 18. Um CI em 16 aprovaria migrations e queries que
# se comportam diferente onde importa, e o desvio só apareceria no deploy.
if grep -q 'postgres:16' "$workflow"; then
  echo "CI hardening: o serviço postgres do CI deve acompanhar a produção (18)" >&2
  exit 1
fi

# ── A verificação de tipos existe e é executada ──────────────────────────────
# Declarar o script sem chamá-lo, ou chamá-lo sem declarar, deixa o portão
# vacuoso. As duas metades são verificadas de propósito.
grep -q '"typecheck": "tsc --noEmit"' "$package"
grep -q 'run: npm run typecheck' "$workflow"

echo "CI hardening policy OK"
