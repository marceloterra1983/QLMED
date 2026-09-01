# Gates: R1 — fiscal e cursor de sync (re-auditoria adversarial)

Base: `origin/audit/remediacao-b177b07` @ 1ad4007 · branch `fix/reaudit-r1` ·
worktree `/home/marce/qlmed/app/.claude/worktrees/agent-a614fb9ab05141a63`.

Invariante: **o cursor NSU não passa por cima de documento fiscal não gravado**,
e uma falha DETERMINÍSTICA não pode travar a ingestão da empresa para sempre.

Superfície: `src/lib/sync-strategies/sefaz.ts`, `src/lib/nfe-cancellation.ts`,
`prisma/migrations/2026090314*`, `prisma/schema.prisma`, os testes dos dois
módulos. Nada mais.

Postgres: só o container descartável `qlmed-r1-pg` (postgres:18-alpine,
127.0.0.1:55432, base `qlmed_ci`). Nunca 127.0.0.1:5432. Nenhuma chamada SEFAZ.

Baseline medido antes de qualquer edição: `Tests 1191 passed | 9 skipped (1200)`,
`Test Files 141 passed | 4 skipped (145)`.

Controlos positivos: restauro SEMPRE por cópia (`scratchpad/orig/*` e
`scratchpad/fixed-sefaz.ts`), nunca por `git checkout`.

---

- [x] **G0 — Setup na branch certa**
  CHECK: git log --oneline -1 && git branch --show-current
  EXPECT: HEAD 1ad4007 (ou descendente), branch fix/reaudit-r1
  EVIDENCE: `1ad4007 merge: trazer origin/main (Button e verificador de tokens de UI)` · `fix/reaudit-r1`

- [x] **G1 — REAUD-FISCAL-015: cancelamento perdido trava o cursor; ciência não**
  `applyNfeCancellationOutcome` devolve `'not-a-cancellation' | 'applied' | 'lost'`.
  Nota já cancelada (reentrega idempotente) conta como `'applied'` — senão a
  reentrega de um evento já aplicado travaria o cursor para sempre.
  Em `sefaz.ts`, ramo `tipo === 'evento'`: `skipDoc` só no `'lost'`.
  Desvio do texto do auditor: `applyNfeCancellation` (booleano) fica como
  wrapper `=== 'applied'` porque `local-xml-sync/apply-event-xml.ts` (fora da
  superfície) declara `Promise<boolean>` e o teste dele afirma `true`/`false`.
  CHECK: npx vitest run src/lib/__tests__/nfe-cancellation.test.ts src/lib/__tests__/sync-cursor-integrity.test.ts 2>&1 | grep -E "Tests|lost|cancelamento"
  EXPECT: todos verdes; casos 'lost', 'applied' (count 0 mas nota existe) e 'not-a-cancellation' presentes
  EVIDENCE: `Test Files 2 passed (2)` · `Tests 37 passed (37)` (13 no cursor + 24 no cancelamento; antes: 9 + 18 = 27). Unitários novos: `'applied' quando a nota já estava cancelada`, `'lost' quando é cancelamento aceite e não existe nota nesta base`, `'not-a-cancellation' para ciência da operação (210210)`.
  CONTROLO POSITIVO: restaurar `sefaz.ts` original (cópia em scratchpad/orig) → teste "cancelamento perdido trava o cursor" VERMELHO com cursor `000000000000011` e `completed`. Restaurar por cópia.
  EVIDENCE-CP: com `sefaz.ts` ORIGINAL: `× cancelamento perdido (lost) trava o cursor antes do evento` → `Expected: "000000000000009" / Received: "000000000000011"`; `× cancelamento real cuja nota não existe nesta base trava o cursor (prova do auditor)` → `Expected: "000000000000009" / Received: "000000000000010"` (o número exacto do auditor). `Tests 4 failed | 9 passed (13)`; o caso "ciência não trava" passa antes e depois, como deve. Restaurado por `cp` da cópia; `cmp` confirma `SEFAZ_IS_FIXED_COPY`.

- [x] **G2 — REAUD-TEST-002: o teste selador vira dois casos + prova do auditor**
  O caso único "evento não gravável não trava o cursor" é substituído por:
  (a) ciência/CCe → cursor avança, `completed`; (b) cancelamento perdido →
  cursor trava antes do NSU do evento, `partial`, motivo `cancelamento_sem_nota`;
  (c) prova do auditor de ponta a ponta: `procEventoNFe` 110111/135 REAL,
  `invoice.updateMany → {count:0}`, `invoice.count → 0`, módulo de cancelamento
  REAL (`vi.importActual`) → cursor trava.
  CHECK: grep -c "cancelamento_sem_nota\|not-a-cancellation" src/lib/__tests__/sync-cursor-integrity.test.ts; grep -c "evento não gravável não trava" src/lib/__tests__/sync-cursor-integrity.test.ts
  EXPECT: >= 3 ocorrências e o teste antigo removido (0)
  EVIDENCE: os três casos existem e passam (`ciência/carta de correção (not-a-cancellation) não trava o cursor`, `cancelamento perdido (lost) trava o cursor antes do evento`, `cancelamento real cuja nota não existe nesta base trava o cursor (prova do auditor)`); o antigo foi removido. Sob o `sefaz.ts` original, (a) passa e (b)+(c) reprovam — o teste distingue agora os dois casos que antes colapsava.

- [x] **G3 — REAUD-DATA-015: P2002 no upsert vira skip durável, o cursor segue**
  `isUniqueViolation` (helper existente em `prisma-errors.ts`) apanha a P2002 em
  `sefaz.ts`; o documento vai para `SyncSkippedDocument` (tabela nova, com XML,
  unique por empresa+chave, migração `20260903140100`) e o cursor avança; a
  corrida fica `partial` com o motivo e o nome do constraint (`meta.target`).
  Se a escrita durável falhar, o erro sobe: cursor não avança (fail-closed).
  Por que tabela e não `SyncLog`: `errorMessage` trunca a chave a 12 dígitos e
  a lista a 15 motivos, e não guarda o XML — não é "durável por chave".
  CHECK: npx vitest run src/lib/__tests__/sync-cursor-integrity.test.ts 2>&1 | grep -E "Tests|P2002|durável"
  EXPECT: teste "P2002 … cursor segue" verde (cursor = ultNSU do lote, upsert em SyncSkippedDocument chamado com a chave) e teste "skip durável falha → cursor não avança" verde
  EVIDENCE: `✓ P2002 no upsert regista skip durável por chave e o cursor segue` (cursor `000000000000012`, `skipUpsert` 1× com `{companyId:'company-1', accessKey: CHAVE_B, nsu:'000000000000011', reason:'unique_violado', xmlContent}`, `partial`, `skippedDocs 1`, `newDocs 2`, errorMessage contém o nome do índice) · `✓ se o skip durável não grava, o cursor não avança (fail-closed)` (cursor `000000000000005`, `status 'error'`, lock largado).
  CONTROLO POSITIVO: restaurar `sefaz.ts` original → teste P2002 VERMELHO (cursor retido em `000000000000010`). Restaurar por cópia.
  EVIDENCE-CP: com `sefaz.ts` ORIGINAL: `× P2002 no upsert regista skip durável por chave e o cursor segue` → `Expected: "000000000000012" / Received: "000000000000010"` (cursor retido = o stall determinístico); `× se o skip durável não grava…` → `Expected: "000000000000005" / Received: "000000000000010"`. Restaurado por cópia.

- [x] **G4 — REAUD-FISCAL-016: índice parcial com COALESCE("series",'')**
  Migração NOVA `20260903140000_issued_nfe_series_coalesce` (a de 20260901180000
  fica intacta) troca o índice e corrige a pré-checagem no cabeçalho para
  agrupar por `COALESCE("series",'')`.
  CHECK: psql no container: duas NF-e issued, mesmo companyId+number, `series` NULL nas duas → segundo INSERT falha com 23505; com o índice antigo passava.
  EXPECT: 23505 `Invoice_issued_nfe_companyId_series_number_key`
  EVIDENCE: depois da migração nova: 1.º INSERT `INSERT 0 1`; 2.º → `ERROR: duplicate key value violates unique constraint "Invoice_issued_nfe_companyId_series_number_key" DETAIL: Key ("companyId", COALESCE(series, ''::text), number)=(c-r1, , 77) already exists.` · `rows_with_number_77 = 1`. Extra: série `''` também colide com NULL (mesmo 23505); série `'1'` com o mesmo número PASSA; NF-e `received` com o mesmo número PASSA (índice continua parcial). `\d "Invoice"`: `UNIQUE, btree ("companyId", COALESCE(series, ''::text), number) WHERE type = 'NFE' AND direction = 'issued'`.
  CONTROLO POSITIVO: no container, antes de aplicar a migração nova (só até 20260902130000), o mesmo par de INSERTs PASSA (COUNT=2). Depois da nova, falha.
  EVIDENCE-CP: com o índice ANTIGO: os dois INSERTs `INSERT 0 1`, `rows_with_number_77 = 2`; a pré-checagem antiga (`GROUP BY "series"`) devolve `c-r1 | (null) | 77 | 2` — dizia "vai falhar" e o índice aceitava, exactamente o desencontro do achado. A pré-checagem nova (COALESCE) devolve a mesma linha, e agora o índice concorda com ela.

- [x] **G5 — Migrações verificadas contra o container descartável**
  CHECK: DATABASE_URL=postgresql://qlmed:qlmed@127.0.0.1:55432/qlmed_ci npm run db:migrate:verify
  EXPECT: exit 0 (migrate deploy aplica as duas novas; migrate diff sem drift)
  EVIDENCE: `VERIFY_EXIT=0` · `The following migration(s) have been applied: 20260903140000_issued_nfe_series_coalesce, 20260903140100_sync_skipped_document` · `No difference detected.` (Baseline antes das minhas migrações também `EXIT=0` — o `migrate diff` ignora o índice parcial, como o cabeçalho de 20260901180000 previa; ignora igualmente o de expressão.) O SQL da tabela foi gerado por `prisma migrate diff --from-config-datasource --to-schema` contra o container, não escrito à mão.

- [x] **G6 — Suíte verde**
  CHECK: npm run typecheck && npm run lint && npm test 2>&1 | grep -E "Tests|Test Files"
  EXPECT: exit 0 nos três; contagem de testes > 1191 (medida, não estimada)
  EVIDENCE: `TYPECHECK_EXIT=0` · `LINT_FULL_EXIT=0` · `npm test` exit 0: `Test Files 141 passed | 4 skipped (145)` · `Tests 1203 passed | 9 skipped (1212)`. Antes: 1191. Diferença +12 = +6 unitários do tri-estado, +4 líquidos no cursor (−1 selador, +5), +2 do portão expand-only (`deploy-manifests.test.ts` faz `it.each` por migração nova; `DROP INDEX` não é DDL destrutivo para ele — só DROP TABLE/COLUMN).

- [ ] **G7 — Commit e push**
  CHECK: git ls-remote origin fix/reaudit-r1
  EXPECT: SHA do HEAD local aparece no remoto
  EVIDENCE: pending

- [x] **G8 — Container derrubado, nada tocou produção**
  CHECK: docker ps -a --filter name=qlmed-r1-pg --format '{{.Names}}' | wc -l
  EXPECT: 0
  EVIDENCE: `docker rm -f qlmed-r1-pg` → `qlmed-r1-pg`; `docker ps -a … | wc -l` → `0`. Todas as ligações desta folha foram a `127.0.0.1:55432/qlmed_ci`; nenhuma a `:5432`, nenhuma chamada SEFAZ (o `SefazClient` esteve mockado em todos os testes).
