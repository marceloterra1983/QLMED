---
id: PLAN-082
status: approved
owner: QLMED
---

# Plan: SPEC-082 — ler sidecars Decimal já expandidos

## Constitution check

- Sem schema novo, sem DROP, sem ROLE-001 (I, expand já feito em SPEC-004 T009).
- Leitura de dinheiro em `src/lib` e uma rota GET (IV).
- Evidência: testes com Prisma mockado (I).
- Isolamento de empresa inalterado (II).

## Approach

1. **Uma função de preferência.** `preferDecimalNumber` em `money.ts` já
   existe (SPEC-081). `financeiro-duplicatas.ts` tinha um clone local —
   passa a importar a mesma.
2. **`mapNfeEntryItem`.** Sidecars `unitPriceDecimal`,
   `totalValueGrossDecimal`, `itemDiscountDecimal`, `totalValueNetDecimal`
   mandam; Float é fallback. Clone de lote copia o sidecar em vez de
   reconverter o Float.
3. **`GET /api/fiscal/by-cfop`.** `select` inclui `totalValueDecimal`;
   soma com `addMoney` + `preferDecimalNumber`. Alíquotas/impostos
   continuam Float (SPEC-004 T010).

## Files

- `src/lib/stock-entry-store.ts`
- `src/lib/financeiro-duplicatas.ts`
- `src/app/api/fiscal/by-cfop/route.ts`
- `src/lib/__tests__/nfe-entry-item-decimal-read.test.ts`
- `src/lib/__tests__/by-cfop-decimal-read.test.ts`

## Complexity

Rejeitado expand de tax Float (T010) neste PR. Rejeitado DROP (T013).
Rejeitado mudar o contrato HTTP (continua `number`).
