# Gates: P1 — Validade a partir do conteúdo do PDF

Scope: `src/lib/documentos/pdf-validity.ts` e `src/lib/__tests__/documentos-pdf-validity.test.ts`. Sem ingestão, sem UI, sem dependência nova. Asset: `public/pdfjs/build/pdf.mjs`. `constants.ts` não foi tocado.

- [x] G1: FGTS "Validade: 31/08/2026 a 29/09/2026" devolve a data FINAL 2026-09-29, não o início 2026-08-31
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "FGTS faixa"
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  2 passed | 15 skipped (17) | Duration  1.91s

- [x] G2: rótulos reais (valida ate / VALIDADE / 7. VALIDADE) casam depois de normalizar acento/caixa/espaço; a primeira data do papel (emissão) não vira validade
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "rotulo|primeira data"
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  8 passed | 9 skipped (17) | Duration  256ms

- [x] G3: 0 caracteres extraídos → validUntil null, confidence nenhuma, textChars 0; bytes inválidos não lançam
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "digitalizacao|bytes invalidos"
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  2 passed | 15 skipped (17) | Duration  2.13s

- [x] G4: data implausível (rodapé 01/01/1900 ou >10 anos no futuro) não vira validade
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "implausivel"
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: Test Files  1 passed (1) | Tests  2 passed | 15 skipped (17) | Duration  350ms

- [x] G5: pdf.js entra só por import dinâmico resolvido em `process.cwd()`, nunca no topo; zero pdf-parse/pdfjs-dist/tesseract
  CHECK: python3 - <<'PY'
from pathlib import Path
p = Path('src/lib/documentos/pdf-validity.ts').read_text()
head = '\n'.join(p.splitlines()[:25])
assert 'pdf.mjs' not in head, 'import de pdf.mjs no topo'
assert "import(" in p and 'pdfjs/build/pdf.mjs' in p
assert 'process.cwd()' in p
for banned in ('pdf-parse', 'pdfjs-dist', 'tesseract'):
    assert f"from '{banned}'" not in p and f'from "{banned}"' not in p
print('IMPORT_OK')
PY
  EXPECT: IMPORT_OK
  EVIDENCE: IMPORT_OK

- [x] G6: prova negativa (i) — rótulo simples antes da faixa faz o teste FGTS falhar com 2026-08-31
  EVIDENCE: RULES = [SIMPLE_RULE, RANGE_RULE] → AssertionError: expected '2026-08-31' to be '2026-09-29' (matcher e PDF). Revertido para [RANGE_RULE, SIMPLE_RULE].

- [x] G7: prova negativa (ii) — sem guarda de plausibilidade o teste da data implausível falha
  EVIDENCE: isPlausibleYmd → return true → expected '1900-01-01' to be null; expected '2036-09-05' to be null. Revertido.

- [x] G8: prova negativa (iii) — extração de 0 caracteres a devolver uma data faz o teste da digitalização falhar
  EVIDENCE: ramo textChars===0 em readValidityFromPdf a devolver 2026-09-29 → AssertionError: expected '2026-09-29' to be null. Revertido para null.

- [x] G9: typecheck e lint limpos
  CHECK: npx tsc --noEmit && npm run lint --silent && echo TL_OK
  EXPECT: TL_OK
  EVIDENCE: TL_OK (tsc --noEmit exit 0; npm run lint exit 0)

- [x] G10: suíte completa com sentinela && (não `| tail`)
  CHECK: npx vitest run > /dev/null 2>&1 && echo SUITE_OK
  EXPECT: SUITE_OK
  EVIDENCE: SUITE_OK
