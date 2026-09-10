# Gates: correções do ultrareview

Scope: corrigir os bugs confirmados no working tree (ANVISA, Graph, lotes, NCM, dashboard, ledger) sem misturar o WIP de logo DANFE.

- [x] G1: tsc limpo no tree
  CHECK: npx tsc --noEmit --pretty false
  EXPECT: /^$/
  EVIDENCE: tsc_exit=0, zero linhas `error TS` (2026-09-10)

- [x] G2: fetchAnvisaData distingue falha vs 404 e etiqueta dataset saude
  CHECK: npx vitest run src/lib/__tests__/anvisa-query-result.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed (6 tests) — inclui `dataset: 'saude'`

- [x] G3: repartição de lotes (igual, misto, resto zero, qCom < n)
  CHECK: npx vitest run src/lib/__tests__/legacy-batch-split.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed (8 tests)

- [x] G4: re-registo de entrada apaga ENTRADA_NFE da nota e usa chave estável
  CHECK: npx vitest run src/lib/__tests__/stock-entry-idempotency.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed — deleteMany `{ companyId, invoiceId, kind: 'ENTRADA_NFE' }` em `$transaction`; key `entrada-item:inv-1:item1:lotL1:serial:row99`; backfill skip se já existe `entrada-item:`

- [x] G5: NCM cache nulo expira em 30s; hit válido em 10 min (não o dobro)
  CHECK: npx vitest run src/lib/__tests__/ncm-memory-ttl.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed (2) — hit aos 9 min / miss aos 10 min+1s; miss nulo hit aos 29s / miss aos 31s

- [x] G6: trimestre do dashboard em UTC sob TZ America/Sao_Paulo
  CHECK: TZ=America/Sao_Paulo npx vitest run src/lib/__tests__/dashboard-quarter-utc.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed (2) com TZ=America/Sao_Paulo — 2026-04-01T01:00Z → Q2

- [x] G7: validate ANVISA usa AnvisaQueryResult (acl + 502)
  CHECK: npx vitest run src/lib/__tests__/acl-company-scope.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed — 502 sem registryUpdate em HTTP 500
