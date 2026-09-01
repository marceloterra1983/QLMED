#!/usr/bin/env bash
# Controle positivo de scripts/render-ui-gallery.mjs.
#
# Uma afirmação de altura que nunca reprova não prova altura nenhuma.
# Adultera o componente de três formas e exige reprovação em cada uma.
set -euo pipefail

ALVO="src/components/ui/Button.tsx"
BAK="$(mktemp)"
cp "$ALVO" "$BAK"
trap 'cp "$BAK" "$ALVO"; rm -f "$BAK"' EXIT

falhas=0
caso() { # nome  sed-de-adulteração
  local nome="$1" edicao="$2"
  cp "$BAK" "$ALVO"
  sed -i "$edicao" "$ALVO"
  if node scripts/render-ui-gallery.mjs --check >/dev/null 2>&1; then
    echo "CEGO  $nome: a afirmação passou com a altura adulterada"
    falhas=$((falhas + 1))
  else
    echo "ok    $nome"
  fi
}

caso "lg cai abaixo do piso de toque"  "s/lg: 'h-11 /lg: 'h-10 /"
caso "md encolhe"                      "s/md: 'h-10 /md: 'h-9 /"
caso "xs perde a altura"               "s/xs: 'h-7 /xs: '/"

cp "$BAK" "$ALVO"
if ! node scripts/render-ui-gallery.mjs --check >/dev/null 2>&1; then
  echo "FALSO componente íntegro reprovou"
  falhas=$((falhas + 1))
else
  echo "ok    componente íntegro aprova"
fi

echo
if [ "$falhas" -ne 0 ]; then
  echo "REPROVADO: $falhas controle(s) inverteram"
  exit 1
fi
echo "APROVADO: 3 adulterações reprovadas, componente íntegro aprovado"
