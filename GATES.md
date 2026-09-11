# Gates: Cartas — assinatura, validade e fabricante

Scope: coluna Assinatura no card; validade/emissão lidas do PDF real
(mesmo com OCR espaçado); fabricante correto (nome ou texto).

- [x] G1: OCR espaçado — CARDIOVENT 26/02/2026 + 6 meses
  CHECK: npx vitest run src/lib/__tests__/documentos-pdf-validity.test.ts -t "CARDIOVENT|OCR espaçado|me ses|202 6" 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  09:46:29 | Duration  150ms (transform 55ms, setup 16ms, import 53ms, tests 4ms, environment 0ms)

- [x] G2: fabricante — ASSINADA/CREDENCIAMENTO/Declaração corrigidos
  CHECK: npx vitest run src/lib/__tests__/documentos-classify.test.ts -t "fabricante|CARDIOVENT|GABMED|Cath|ASSINADA" 2>&1 | tail -25
  EXPECT: /passed/
  EVIDENCE: Start at  09:46:29 | Duration  154ms (transform 47ms, setup 16ms, import 46ms, tests 5ms, environment 0ms)

- [x] G3: card cartas mostra Assinatura (emitidoEm)
  CHECK: npx vitest run src/components/__tests__/documentos-family-table.test.tsx -t "Assinatura|carta" 2>&1 | tail -25
  EXPECT: /passed/
  EVIDENCE: Start at  09:46:30 | Duration  625ms (transform 62ms, setup 16ms, import 156ms, tests 124ms, environment 243ms)

- [x] G4: tsc limpo
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK
