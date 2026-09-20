# Tasks: Paginação real das listas fiscais/financeiras

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Setup

- [x] T001 Worktree `feat/077-fiscal-list-pagination` em `/home/marce/qlmed/.worktrees/077-fiscal-list-pagination` (não substituir preview)
- [x] T002 Spec Kit 077: spec, plan, tasks, checklist, feature.json (pin 0.14.2 intacto)

## Phase 2: Foundational

- [x] T003 Helper `src/lib/list-pagination.ts` + `src/lib/__tests__/list-pagination.test.ts` (`shouldCountListTotal`, page sizes 50)
- [x] T004 `ListCount` paginado em `src/components/ui/ListCount.tsx` + `src/components/ui/__tests__/ListCount.test.tsx`
- [x] T005 `src/components/ui/ListPagination.tsx` (Anterior / Próxima, pt-BR)

## Phase 3: US1 listas fiscais

- [x] T006 [US1] `src/app/api/invoices/route.ts` honra `includeTotal` via helper
- [x] T007 [US1] `src/app/(painel)/fiscal/invoices/page-client.tsx` page size 50 + paginação
- [x] T008 [P] [US1] `issued/page-client.tsx`, `cte/page-client.tsx`, `nfse-recebidas/page-client.tsx` idem
- [x] T009 [US1] Atualizar `src/lib/__tests__/audit-data-display.test.ts` e renders fiscais (AC-077-001, AC-077-006)

## Phase 4: US2 financeiro

- [x] T010 [US2] `FinanceiroPageClient.tsx` envia `limit` 50 e folheia páginas
- [x] T011 [US2] Rodapé em `FinanceiroTable.tsx` com ListPagination / total honesto

## Phase 5: US3/US4

- [x] T012 [US3] Quatro listas fiscais só escrevem contagem via ListCount
- [x] T013 [US4] `src/components/SidebarNav.tsx` `prefetch={false}` + teste

## Phase 6: Verify

- [x] T014 `npm test` 2449 passed / 9 skipped; `npx tsc --noEmit`; `npm run lint`; `npm run docs:validate` 279 files / 94 IDs
- [x] T015 `graphify update` no worktree (grafo canônico se este não tiver)
- [x] T016 Smoke preview `:3002` após rebase do tip na worktree preview
