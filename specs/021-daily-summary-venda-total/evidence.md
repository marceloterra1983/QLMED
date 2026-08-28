# Evidence: SPEC-021 — cabeçalho do resumo só com venda

- TDD: `npx vitest run src/lib/__tests__/daily-issued-summary.test.ts` falhou
  primeiro (7 testes: funções ausentes); depois 11 passed / 1 file.
- `npm run docs:validate` — passed (97 Markdown files, 29 IDs).
- `npx tsc --noEmit` e `npm run lint` — sem erro (re-medido após o tipo
  aceitar `number` opcional no fixture).
- `npm test` após merge da SPEC-020 — 54 files passed, 3 skipped; 384 tests passed, 4 skipped (2.47s).
- `cancelledAt` já vem em `GET /api/invoices`; cabeçalho e n8n excluem cancelada.
- n8n: snapshot `~/ops/n8n/qlmed-workflows-snapshot/dailysummaryissued01.json`
  com `sales = invoices.filter(isVenda)` e rótulos *Notas de venda* /
  *Valor de vendas*. **Ainda falta** `n8n-promote.sh promote … qlmed --execute-approved`.
