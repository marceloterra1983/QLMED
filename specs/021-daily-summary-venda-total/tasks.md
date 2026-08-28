# Tasks: SPEC-021

**Input**: Design documents from `/specs/021-daily-summary-venda-total/`

## Phase 1: Setup

- [x] T001 Spec + checklist + plan + research em `specs/021-daily-summary-venda-total/`
- [x] T002 Nota de supersessão em `specs/018-daily-summary-consig/spec.md`

## Phase 2: Foundational

- [x] T003 Testes do cabeçalho (TDD) em `src/lib/__tests__/daily-issued-summary.test.ts`

## Phase 3: User Story 1 — Cabeçalho só venda

- [x] T004 [US1] `summarizeIssuedDailySalesHeader` em `src/lib/daily-issued-summary.ts`
- [x] T005 [US1] Rótulos `Notas de venda` / `Valor de vendas` em `src/lib/daily-issued-summary.ts`

## Phase 4: User Story 2 — Não-venda fora da soma

- [x] T006 [US2] CFOP vazio/desconhecido e dia só não-venda cobertos no mesmo teste
- [x] T007 [US2] Node n8n `Montar Resumo` em `~/ops/n8n/qlmed-workflows-snapshot/dailysummaryissued01.json`

## Phase 5: Polish

- [x] T008 docs:validate, tsc, lint, `npm test`
- [x] T009 Evidence em `specs/021-daily-summary-venda-total/evidence.md`
