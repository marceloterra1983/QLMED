# Tasks: Autorizações CASSEMS em Gestão

**Input**: Design documents from `/specs/024-gestao-cassems-autorizacoes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/api-gestao-cassems.md](./contracts/api-gestao-cassems.md)

**Tests**: exigidos pela spec (parser 2479325231, dedup, ACL 403,
upload gate, folder scan).

## Phase 1: Setup

- [x] T001 Create mailbox/sender/folder constants in `src/lib/cassems/constants.ts`
- [x] T002 [P] Point `governance.yaml` `feature_root` and `.specify/feature.json` to `specs/024-gestao-cassems-autorizacoes`

## Phase 2: Foundational

- [x] T003 Add `CassemsParseStatus` and models plus `Company` relations in `prisma/schema.prisma`
- [x] T004 Create expand-only migration `prisma/migrations/20260830140000_add_cassems_authorization/migration.sql`
- [x] T005 Update `EXPECTED_MIGRATION` and SQL SHA in `scripts/verify-production-migration-window.cjs` and assert in `scripts/test-production-migration-window.cjs`
- [x] T006 [P] Add Gestão / CASSEMS to `src/lib/navigation.ts` with prefix `/api/gestao/cassems` (and split IMPCG prefix)
- [x] T007 [P] Add Gestão / CASSEMS to `src/components/SidebarNav.tsx`
- [x] T008 [P] Add `listMailboxMessagesBySender` in `src/lib/graph-mail-client.ts`
- [x] T009 Add `cassems-mail-ingest` to `src/lib/background-service-health.ts` and lock key in `src/lib/postgres-advisory-lock.ts`

## Phase 3: User Story 1 — Ver autorizações (P1)

- [x] T010 [P] [US1] ACL 403 tests in `src/lib/__tests__/cassems-acl.test.ts`
- [x] T011 [P] [US1] Empty-list and sort contract in `src/lib/__tests__/cassems-list-contract.test.ts`
- [x] T012 [US1] Read/list helpers in `src/lib/cassems/store.ts`
- [x] T013 [US1] `GET /api/gestao/cassems` in `src/app/api/gestao/cassems/route.ts` with `requireAuth(`
- [x] T014 [P] [US1] Detail and arquivo GET routes with `requireAuth(`
- [x] T015 [US1] Page + client (`Modal`, PDF iframe, pt-BR) in `src/app/(painel)/gestao/cassems/`

## Phase 4: User Story 2 — E-mail vira arquivo e linha (P1)

- [x] T016 [P] [US2] Parser fixture 2479325231 in `src/lib/__tests__/cassems-parse-oficio.test.ts`
- [x] T017 [P] [US2] Dedup tests in `src/lib/__tests__/cassems-ingest-dedup.test.ts`
- [x] T018 [P] [US2] Upload-fail gate in `src/lib/__tests__/cassems-upload-gate.test.ts`
- [x] T019 [US2] Parser in `src/lib/cassems/parse-oficio.ts` (centavos, layout OPME)
- [x] T020 [US2] Persist confirmed/upgrade in `src/lib/cassems/store.ts`
- [x] T021 [US2] Mail ingest in `src/lib/cassems/ingest.ts`

## Phase 5: User Story 4 — Pasta sem Graph Mail (P1)

- [x] T022 [P] [US4] Folder scan test in `src/lib/__tests__/cassems-folder-scan.test.ts`
- [x] T023 [US4] Folder ingest in `src/lib/cassems/folder-ingest.ts` + extract-pdf
- [x] T024 [US4] Wire folder scan into `runCassemsIngest` even on mailbox 403

## Phase 6: User Story 3 — Sync / worker (P2)

- [x] T025 [US3] POST `/api/gestao/cassems/sync`
- [x] T026 [US3] Start worker in `src/lib/bootstrap.ts`

## Phase 7: Polish

- [x] T027 Run `docs:validate`, `tsc`, `lint`, `npm test`, `db:migrate:verify`, `db:reconcile:verify`
- [x] T028 `graphify update` no worktree
