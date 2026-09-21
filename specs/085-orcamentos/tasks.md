# Tasks: Orçamentos (SPEC-085)

**Input**: `specs/085-orcamentos/` (spec, plan, research, data-model, contracts)

## Phase 1: Foundation

- [x] T001 Spec Kit (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/api.md`, `quickstart.md`, checklist)
- [x] T002 Prisma `Quote`/`QuoteItem` + migração expand-only + pin no portão
- [x] T003 [P] `src/lib/orcamentos/totals.ts` + `number.ts` + testes
- [x] T004 [P] Navegação: `PAGE_GROUPS`, `PAGE_LABELS`, `buildNavItems`, ACL `/api/orcamentos`
- [x] T005 [P] Zod `src/lib/schemas/orcamentos.ts`

## Phase 2: US1 — Menu e ACL (P1)

- [x] T006 Testes `orcamentos-acl.test.ts` e ajuste `sidebar-nav-paths` / `navigation.test.ts`
- [x] T007 Rotas placeholder da página (layout + page.tsx) para o path existir

## Phase 3: US2 — Editor e persistência (P1)

- [x] T008 Store + rotas GET/POST/PATCH/cancelar/duplicar + clientes + produtos
- [x] T009 UI lista + editor (PageHeader, busca, itens, totais)
- [x] T010 Teste de página (título, Novo orçamento)

## Phase 4: US3 — PDF (P1)

- [x] T011 `pdf-html.ts` + `issuer.ts` + rota PDF
- [x] T012 Teste HTML fixture SPICA

## Phase 5: US4 — duplicar/cancelar (P2)

- [x] T013 Ações na lista/editor ligadas às rotas já criadas em T008

## Phase 6: Quality

- [x] T014 `docs:validate`, `tsc`, testes focados, pin de migração
- [ ] T015 Preview `:3002` smoke `/orcamentos`
