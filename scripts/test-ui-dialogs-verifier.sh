#!/usr/bin/env bash
# Controle positivo de scripts/verify-ui-dialogs.mjs.
#
# Um verificador que nunca reprova é indistinguível de um verificador cego.
# Este harness injeta uma violação de cada tipo num fixture e exige reprovação,
# e exige aprovação no fixture limpo. Falha se qualquer um dos dois inverter.
set -euo pipefail

VERIFIER="$(cd "$(dirname "$0")" && pwd)/verify-ui-dialogs.mjs"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

falhas=0

caso() { # nome  esperado(pass|fail)  conteudo
  local nome="$1" esperado="$2" conteudo="$3"
  local dir="$TMP/$nome"
  mkdir -p "$dir"
  printf '%s\n' "$conteudo" > "$dir/Fixture.tsx"
  local saida rc
  set +e
  saida="$(node "$VERIFIER" "$dir" 2>&1)"; rc=$?
  set -e
  if [ "$esperado" = "fail" ] && [ "$rc" -eq 0 ]; then
    echo "CEGO  $nome: verificador aprovou uma violação real"
    echo "$saida" | sed 's/^/      /'
    falhas=$((falhas + 1))
  elif [ "$esperado" = "pass" ] && [ "$rc" -ne 0 ]; then
    echo "FALSO $nome: verificador reprovou código correto"
    echo "$saida" | sed 's/^/      /'
    falhas=$((falhas + 1))
  else
    echo "ok    $nome (esperado $esperado, rc=$rc)"
  fi
}

caso overlay-a-mao fail \
  'export const A = () => <div className="fixed inset-0 z-50 flex"><div role="dialog" aria-label="x">x</div></div>;'

caso overlay-em-template fail \
  'export const A = () => <div className={`fixed inset-0 z-50 ${x}`}>x</div>;'

caso dialogo-sem-nome fail \
  'export const A = () => <div role="dialog" aria-modal="true">x</div>;'

caso dialogo-sem-nome-atras-de-arrow fail \
  'export const A = () => <div onClick={() => f()} role="dialog" aria-modal="true">x</div>;'

caso alertdialog-sem-nome fail \
  'export const A = () => <div role="alertdialog">x</div>;'

# `sm:fixed inset-0` passa: a regra só policia o overlay em repouso, sem prefixo
# de variante — um `fixed` só a partir de `sm` não cobre a tela em todo tamanho.
# `absolute inset-0` é o backdrop do próprio Modal, não overlay.
caso limpo pass \
  'export const A = () => (
  <>
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="t"
    ><h2 id="t">T</h2></div>
    <div onClick={() => f()} role="dialog" aria-label="Confirmar">x</div>
    <div className="sm:fixed inset-0">y</div>
    <div className="absolute inset-0 hidden sm:block" aria-hidden="true" />
  </>
);'

echo
if [ "$falhas" -ne 0 ]; then
  echo "REPROVADO: $falhas controle(s) inverteram"
  exit 1
fi
echo "APROVADO: 5 violações reprovadas, fixture limpo aprovado"
