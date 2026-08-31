#!/usr/bin/env bash
#
# Portão de endurecimento do CI. Cada asserção abaixo é uma DECISÃO, não uma
# convenção acidental — foram introduzidas na remediação de auditoria de
# 2026-08-17 (commit b0acd0e) e precisadas por SPEC-013.
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
drift=".github/workflows/ai-tooling-drift.yml"
deploy=".github/workflows/deploy-production.yml"
package="package.json"

test -f "$workflow"
test -f "$drift"
test -f "$deploy"
test -f "$package"

# Exact binding labels (validation-linux-pool + self-hosted). Not a new
# qlmed-ci label. Not Linux/X64 generics. Not profitbridge-linux.
expected_labels='self-hosted
pb-linux
pb-x64
pb-docs
pb-python
pb-shell
pb-powershell
pb-dotnet
pb-node
pb-validation
pb-build
pb-persistent'

# ── O CI NÃO roda no host de produção ────────────────────────────────────────
# O CI executa `npm ci`, que roda scripts de instalação de centenas de pacotes.
# No runner `qlmed-prod` isso ocorreria como usuário `marce`, na máquina que
# hospeda o banco fiscal, o n8n, as credenciais e os backups — com acesso ao
# grupo `docker`, que é root na prática.
#
# `deploy-production.yml` USA `qlmed-prod`, e corretamente: precisa tocar a
# máquina, roda só por dispatch manual com SHA fixado, e não instala
# dependências vindas de pull request.
#
# SPEC-013: o que a auditoria quis proteger é o host de produção, não a
# string `self-hosted`. O selector isolado inclui `self-hosted` (label default
# do GitHub no listener de CI) mais as capabilities do perfil. `runs-on` só
# com `self-hosted` continua proibido: o matching AND ficaria demasiado largo.
if grep -q 'qlmed-prod' "$workflow"; then
  echo "CI hardening: ci.yml não pode usar o runner de produção qlmed-prod" >&2
  exit 1
fi
if grep -q 'qlmed-prod' "$drift"; then
  echo "CI hardening: ai-tooling-drift.yml não pode usar qlmed-prod" >&2
  exit 1
fi
if ! grep -q 'qlmed-prod' "$deploy"; then
  echo "CI hardening: deploy-production.yml deve continuar em qlmed-prod" >&2
  exit 1
fi

# Sem fallback hospedado: um bloqueio de minutos não pode ser "resolvido"
# voltando a ubuntu-24.04. O CI ou corre no isolado, ou não corre.
if grep -Eq 'ubuntu-24\.04|ubuntu-latest' "$workflow" "$drift"; then
  echo "CI hardening: CI não pode usar runner hospedado (sem fallback ubuntu-*)" >&2
  exit 1
fi

# Service containers exigem socket de engine; o isolado não expõe. Postgres
# do job `app` é o sidecar na runner-internal, não `services:`.
if grep -Eq '^[[:space:]]+services:' "$workflow"; then
  echo "CI hardening: ci.yml não pode declarar service containers" >&2
  exit 1
fi
if grep -q 'postgres:16' "$workflow"; then
  echo "CI hardening: o Postgres do CI deve acompanhar a produção (18)" >&2
  exit 1
fi
if grep -Eq '127\.0\.0\.1:5433' "$workflow"; then
  echo "CI hardening: DATABASE_URL não pode apontar para 127.0.0.1:5433" >&2
  exit 1
fi
if ! grep -q 'qlmed-ci-db:5432' "$workflow"; then
  echo "CI hardening: DATABASE_URL deve usar o sidecar qlmed-ci-db:5432" >&2
  exit 1
fi
if grep -Eq 'postgresql://postgres@|postgresql://postgres:' "$workflow"; then
  echo "CI hardening: DATABASE_URL não pode usar o superuser postgres" >&2
  exit 1
fi

# Contrato de eventos (fase 0.2): estes triggers a disparar job self-hosted
# são a via clássica de RCE em repos públicos. `! grep` NÃO aborta sob
# `set -e` — a proibição é `if grep; then fail; fi`.
while IFS= read -r -d '' file; do
  if grep -Eq '^[[:space:]]*(pull_request_target|workflow_run|issue_comment)[[:space:]]*:' "$file"; then
    echo "CI hardening: $file não pode disparar pull_request_target, workflow_run ou issue_comment" >&2
    exit 1
  fi
done < <(find .github/workflows -maxdepth 1 -type f \( -name '*.yml' -o -name '*.yaml' \) -print0)

# Selector exacto do binding em todo job de CI / drift.
python3 - "$workflow" "$drift" "$expected_labels" <<'PY'
from __future__ import annotations

import re
import sys
from pathlib import Path

workflow, drift, expected_text = sys.argv[1], sys.argv[2], sys.argv[3]
expected = expected_text.strip().splitlines()


def runs_on_blocks(path: str) -> list[list[str] | str]:
    lines = Path(path).read_text(encoding="utf-8").splitlines()
    found: list[list[str] | str] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        if re.match(r"^\s+runs-on:\s*$", line):
            labels: list[str] = []
            index += 1
            while index < len(lines) and re.match(r"^\s+-\s+\S", lines[index]):
                labels.append(lines[index].split("-", 1)[1].strip())
                index += 1
            found.append(labels)
            continue
        if re.match(r"^\s+runs-on:\s*\S", line):
            found.append(line.strip())
        index += 1
    return found


def require_binding(path: str) -> None:
    blocks = runs_on_blocks(path)
    if not blocks:
        raise SystemExit(f"CI hardening: {path} não declara runs-on")
    for block in blocks:
        if block != expected:
            raise SystemExit(
                f"CI hardening: {path} runs-on deve ser o array exacto do binding, obtido {block!r}"
            )


require_binding(workflow)
require_binding(drift)
PY

if ! grep -q 'verify-ci-isolation.py' "$workflow"; then
  echo "CI hardening: ci.yml deve executar a prova de isolamento SC-003" >&2
  exit 1
fi
if ! grep -q 'qlmed-ci-linux-01' "$workflow"; then
  echo "CI hardening: ci.yml deve recusar qualquer runner que não seja qlmed-ci-linux-01" >&2
  exit 1
fi
if ! grep -q 'reset-ci-database.mjs' "$workflow"; then
  echo "CI hardening: o job app deve resetar o schema public entre execuções" >&2
  exit 1
fi

# Guarda de origem (defesa em profundidade; a fronteira real é
# all_external_contributors). Igual ao Farol.
if ! grep -q 'github.event.pull_request.head.repo.full_name == github.repository' "$workflow"; then
  echo "CI hardening: ci.yml deve guardar PRs de fork como o Farol" >&2
  exit 1
fi

# ── A verificação de tipos existe e é executada ──────────────────────────────
# Declarar o script sem chamá-lo, ou chamá-lo sem declarar, deixa o portão
# vacuoso. As duas metades são verificadas de propósito.
grep -q '"typecheck": "tsc --noEmit"' "$package"
grep -q 'run: npm run typecheck' "$workflow"

echo "CI hardening policy OK"
