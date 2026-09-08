# Gates: SPEC-063 lotes na emissão NF-e

Scope: Emissão seleciona lote do estoque; XML com rastro; consignação baixa o lote escolhido.

- [x] G1: Spec SPEC-063 existe
  CHECK: test -f specs/063-nfe-emissao-lotes-estoque/spec.md && rg -q 'REQ-005' specs/063-nfe-emissao-lotes-estoque/spec.md
  EXPECT: 
  EVIDENCE: (no output)

- [x] G2: Testes rastro + batches + consignação
  CHECK: ./node_modules/.bin/vitest run src/lib/__tests__/nfe-emission-xml.test.ts src/lib/__tests__/nfe-emission-rastro.test.ts src/lib/__tests__/stock-ledger.test.ts src/lib/__tests__/saida-material.test.ts 2>&1 | tail -20
  EXPECT: /Test Files  4 passed/
  EVIDENCE: Start at  14:40:32 | Duration  398ms (transform 363ms, setup 64ms, import 514ms, tests 75ms, environment 0ms)

- [x] G3: tsc limpo
  CHECK: npx tsc --noEmit; echo tsc_exit:$?
  EXPECT: tsc_exit:0
  EVIDENCE: tsc_exit:0

- [x] G4: Saída Material envia lote no rascunho
  CHECK: rg -n 'lotExpiry: line.lotExpiry' 'src/app/(painel)/estoque/saida-material/page-client.tsx'
  EXPECT: lotExpiry
  EVIDENCE: 319:          lotExpiry: line.lotExpiry,
