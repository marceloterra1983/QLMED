# Gates: R2 — laço do backfill fiscal (re-auditoria adversarial)

Escopo: fechar REAUD-DATA-014 (laço `while (remaining > 0)` que não termina
quando uma NF-e nunca ganha `item_count`) e REAUD-TEST-001 (o teste que dizia
prová-lo media aritmética de mocks).

Base: `origin/audit/remediacao-b177b07` @ 1ad4007 · branch `fix/reaudit-r2`

Superfície: `src/app/api/invoices/backfill-tax/route.ts`,
`src/app/(painel)/fiscal/dashboard/page-client.tsx`,
`src/lib/__tests__/audit-l8-invoice-routes.test.ts`,
`src/app/(painel)/fiscal/dashboard/__tests__/page-client.render.test.tsx` (novo).

Backups para os controlos positivos (restaurar por `cp`, nunca `git checkout`):
`$SCRATCH/r2-backup/{route.ts,page-client.tsx,audit-l8.test.ts}.orig`.

---

- [x] **G1 — Base verde antes de tocar em código**
  CHECK: git log --oneline -1 && npx vitest run 2>&1 | grep -E "Test Files|Tests "
  EXPECT: HEAD 1ad4007; `Tests N passed`
  EVIDENCE: `1ad4007 merge: trazer origin/main (Button e verificador de tokens de UI)`; `Test Files 141 passed | 4 skipped (145)`; `Tests 1191 passed | 9 skipped (1200)`.

- [x] **G2 — REAUD-DATA-014 (servidor): nota ilegível ganha marca e sai do lote**
  `extractAllTaxData` que rejeita, ou `xmlContent` vazio, grava
  `item_count = -1` (`UNREADABLE_ITEM_COUNT`) fora do `try`; a nota conta em
  `errors`, não em `processed`; `remaining` cai a 0 na mesma chamada e a
  chamada seguinte não a reseleciona (`extractAllTaxData` não é chamado).
  CHECK: npx vitest run src/lib/__tests__/audit-l8-invoice-routes.test.ts 2>&1 | grep -E "Tests |✓|✗|×|FAIL"
  EXPECT: todos os testes do ficheiro passam, incluindo o de `mockRejectedValue` e o de `xmlContent` vazio
  EVIDENCE: `Tests 8 passed (8)` (eram 5). Sonda de 8 chamadas seguidas com a rota corrigida, `remaining` por volta: reject `[0,0,0,0,0,0,0,0]`, vazio `[0,0,0,0,0,0,0,0]`.

- [x] **G3 — Controlo positivo de G2: com o `route.ts` original o teste reprova**
  CHECK: cp $SCRATCH/r2-backup/route.ts.orig src/app/api/invoices/backfill-tax/route.ts && npx vitest run src/lib/__tests__/audit-l8-invoice-routes.test.ts 2>&1 | grep -E "Tests |×|FAIL"; cp <versão corrigida> de volta
  EXPECT: `Tests N failed`; `remaining` medido = 1 nas duas chamadas com o código antigo
  EVIDENCE: `Tests 4 failed | 4 passed (8)`. Falhas: `expected undefined to be -1` (nada gravado para o XML que não parseia), `expected 1 to be +0` (xmlContent vazio contava como `processed`), `expected undefined to be +0` ×2 (`remaining` ausente na saída antecipada). Sonda de 8 chamadas com a rota original, `remaining` por volta: reject `[1,1,1,1,1,1,1,1]`, vazio `[1,1,1,1,1,1,1,1]`. Restaurado por `cp` do `.fixed`; md5 `c283d413…` igual nos dois.

- [x] **G4 — REAUD-DATA-014 (cliente): o laço do dashboard para**
  Teste de render (jsdom) monta `FiscalDashboardPage`, `fetch` mockado devolve
  `remaining: 1` para sempre: o laço faz exatamente 2 chamadas (a 2ª não fez
  `remaining` cair) e avisa por toast. Com `remaining` a cair 1 por volta sem
  chegar a 0, para no tecto `BACKFILL_MAX_ROUNDS`.
  CHECK: npx vitest run "src/app/(painel)/fiscal/dashboard/__tests__/page-client.render.test.tsx" 2>&1 | grep -E "Tests |✓|×|FAIL"
  EXPECT: `Tests 2 passed` (sem progresso; tecto)
  EVIDENCE: `Tests 3 passed (3)` — sem progresso (2 chamadas), tecto (500 chamadas) e o caminho feliz (remaining chega a 0, `toast.success`). Duração 1,32 s.

- [x] **G5 — Controlo positivo de G4: com o `page-client.tsx` original o teste reprova**
  O mock tem válvula de segurança (rejeita depois de 1000 chamadas) para o
  código antigo reprovar em vez de pendurar o runner.
  CHECK: cp $SCRATCH/r2-backup/page-client.tsx.orig "src/app/(painel)/fiscal/dashboard/page-client.tsx" && npx vitest run "src/app/(painel)/fiscal/dashboard/__tests__/page-client.render.test.tsx" 2>&1 | grep -E "Tests |×|FAIL|expected"; cp <versão corrigida> de volta
  EXPECT: `Tests 2 failed`; contagem de chamadas medida = 1000 (a válvula), não 2
  EVIDENCE: `Tests 2 failed | 1 passed (3)`. `expected 1001 to be 2` (sem progresso: o laço antigo só parou porque a 1001ª chamada rejeitou) e `expected 1001 to be undefined` (tecto: `BACKFILL_MAX_ROUNDS` não existia no ficheiro antigo). O caminho feliz passa nos dois, como devia. Restaurado por `cp` do `.fixed`; md5 `623f48b7…` igual nos dois.

- [x] **G6 — REAUD-TEST-001: o teste mede escrita, não mocks**
  `upsertTaxTotals` mockado alimenta um `Map`; `invoiceTaxTotals.findMany` e
  `.count` mockados lêem o mesmo `Map` aplicando o filtro `itemCount` que a
  rota passa. Nenhum `taxTotalsCount.mockResolvedValue`/valor fixo sobra.
  CHECK: grep -c "taxTotalsCount.mockResolvedValue\|taxTotalsCount.mockImplementation(async (args: { where?: { itemCount?: unknown } }) =>" src/lib/__tests__/audit-l8-invoice-routes.test.ts; grep -c "mockRejectedValue" src/lib/__tests__/audit-l8-invoice-routes.test.ts
  EXPECT: 0 e >= 1
  EVIDENCE: `fixed-value count mocks: 0`, `mockRejectedValue: 1`. G3 é a prova de que o teste novo mede: com a rota antiga ele reprova em 4 de 8.

- [x] **G7 — typecheck, lint e suíte inteira verdes; contagem final medida**
  CHECK: npm run typecheck && npm run lint && npx vitest run 2>&1 | grep -E "Test Files|Tests "
  EXPECT: exit 0 nos três; `Tests` > 1191 passed
  EVIDENCE: `typecheck exit=0`, `lint exit=0`, `Test Files 142 passed | 4 skipped (146)`, `Tests 1197 passed | 9 skipped (1206)` — +6 testes (+3 no L8, +3 no render novo), +1 ficheiro.

- [ ] **G8 — Commit e push confirmados no remoto**
  CHECK: git push -u origin fix/reaudit-r2 && git ls-remote origin fix/reaudit-r2 && git rev-parse HEAD
  EXPECT: o SHA do `ls-remote` é igual ao `rev-parse HEAD`
  EVIDENCE: pending
