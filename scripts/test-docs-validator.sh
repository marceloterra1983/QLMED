#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/valid" --quiet

if node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/invalid" --quiet >/dev/null 2>&1; then
  echo "invalid documentation fixture unexpectedly passed" >&2
  exit 1
fi

# QLMED-DOC-001: doc de deploy que ensina `db:push` ou promete `workflow_run`
# tem de reprovar. Sem este caso, apagar a regra do validador passaria calado.
if node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/deploy-invalid" --quiet >/dev/null 2>&1; then
  echo "stale deploy documentation fixture unexpectedly passed" >&2
  exit 1
fi

# E as duas metades da regra são exercidas: a fixture cobre db:push E
# workflow_run, então o validador precisa reportar os dois erros, não um só.
deploy_errors="$(node "$root/scripts/validate-docs.mjs" --root "$root/scripts/docs-fixtures/deploy-invalid" --quiet 2>&1 || true)"
for needle in 'db:push' 'workflow_run'; do
  if ! printf '%s' "$deploy_errors" | grep -q -- "$needle"; then
    echo "deploy documentation rule did not flag $needle" >&2
    printf '%s\n' "$deploy_errors" >&2
    exit 1
  fi
done

echo "Documentation validator fixtures passed."

