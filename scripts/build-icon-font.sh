#!/usr/bin/env bash
# Regenera public/fonts/material-symbols.woff2 a partir do Material Symbols
# variável, fixando os eixos nos valores que globals.css já usava.
#
# Por que instanciar e NÃO fazer subset: instanciar sozinho corta ~65% e mantém
# os 6466 glifos, então ícone novo continua funcionando sem regerar nada. Um
# subset dos ícones em uso corta só 3% a mais e passa a exigir uma lista sempre
# atualizada — ícone fora da lista vira texto cru na tela.
#
# Rode só quando trocar a versão upstream da fonte.
# Uso: bash scripts/build-icon-font.sh caminho/para/MaterialSymbolsOutlined.woff2
set -euo pipefail

SRC="${1:?informe o .woff2 variável de origem}"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/public/fonts/material-symbols.woff2"

python3 -m venv /tmp/icon-font-venv
/tmp/icon-font-venv/bin/pip install --quiet fonttools brotli

/tmp/icon-font-venv/bin/python - "$SRC" "$OUT" <<'PY'
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

src, out = sys.argv[1], sys.argv[2]
font = TTFont(src)
before = len(font.getGlyphOrder())
instancer.instantiateVariableFont(font, {'FILL': 1, 'wght': 400}, inplace=True, updateFontNames=False)
after = len(font.getGlyphOrder())
assert before == after, f'perdeu glifos: {before} -> {after}'
assert 'fvar' not in font, 'ainda tem eixos variáveis'
font.flavor = 'woff2'
font.save(out)
print(f'ok: {after} glifos preservados')
PY

ls -l "$OUT"
