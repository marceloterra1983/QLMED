# Gates: saldo inicial no corte 2021

Scope: abrir estoque pré-2021 pelo déficit atual e tornar o backfill resumível.

- [x] G1: computeImpliedOpenings coberto
  CHECK: npx vitest run src/lib/__tests__/stock-ledger-backfill.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Test Files  1 passed (1) / Tests  18 passed (18)

- [x] G2: tsc limpo
  CHECK: npx tsc --noEmit
  EXPECT: /^$/
  EVIDENCE: tsc --noEmit exit 0

- [x] G3: Ledger retomado e SALDO_INICIAL gravado
  EVIDENCE: issued 12635/12635, received 1473/1473, SALDO_INICIAL 4102

- [x] G4: Sem produto/lote negativo após abertura
  EVIDENCE: lot_neg=0 prod_neg=0 (psql 2026-09-08)
