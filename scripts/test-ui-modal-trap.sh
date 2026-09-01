#!/usr/bin/env bash
# Controle positivo de src/lib/focus-trap.ts.
#
# Um teste de foco preso que nunca reprova não prende foco nenhum.
# Adultera a decisão do Tab de quatro formas e exige reprovação em cada uma.
set -euo pipefail

ALVO="src/lib/focus-trap.ts"
BAK="$(mktemp)"
cp "$ALVO" "$BAK"
trap 'cp "$BAK" "$ALVO"; rm -f "$BAK"' EXIT

falhas=0
caso() { # nome  sed-de-adulteração
  local nome="$1" edicao="$2"
  cp "$BAK" "$ALVO"
  sed -i "$edicao" "$ALVO"
  if cmp -s "$BAK" "$ALVO"; then
    echo "FALSO $nome: o sed não casou, o alvo ficou íntegro"
    falhas=$((falhas + 1))
    return
  fi
  if npx vitest run src/lib/__tests__/focus-trap.test.ts >/dev/null 2>&1; then
    echo "CEGO  $nome: a suíte passou com o trap adulterado"
    falhas=$((falhas + 1))
  else
    echo "ok    $nome"
  fi
}

caso "do último não volta ao primeiro"   's/return atual === focaveis.length - 1 ? 0 : null;/return null;/'
caso "do primeiro não volta ao último"   's/if (shift) return atual === 0 ? focaveis.length - 1 : null;/if (shift) return null;/'
caso "foco perdido não volta ao diálogo" 's/if (atual < 0) return shift ? focaveis.length - 1 : 0;//'
caso "sem guarda de lista vazia"         's/if (focaveis.length === 0) return null;//'

cp "$BAK" "$ALVO"
if ! npx vitest run src/lib/__tests__/focus-trap.test.ts >/dev/null 2>&1; then
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
echo "APROVADO: 4 adulterações reprovadas, componente íntegro aprovado"
