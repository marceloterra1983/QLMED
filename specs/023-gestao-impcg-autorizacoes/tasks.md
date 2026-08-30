# Tasks: Autorizações IMPCG em Gestão

**Input**: Design documents from `/specs/023-gestao-impcg-autorizacoes/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md),
[research.md](./research.md), [data-model.md](./data-model.md),
[contracts/api-gestao-impcg.md](./contracts/api-gestao-impcg.md)

**Tests**: exigidos pela spec (parser 17673, dedup, ACL 403, upload
gate). Escrever o teste e ver falhar antes do código.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: paralelo (arquivo diferente, sem depender de tarefa incompleta)
- **[Story]**: US1 lista/popup, US2 coleta/dedup, US3 sync/histórico

## Phase 1: Setup

**Purpose**: constantes e apontar a feature no worktree

- [ ] T001 Create mailbox/sender/folder constants in `src/lib/impcg/constants.ts`
- [ ] T002 [P] Confirm `governance.yaml` `feature_root` is `specs/023-gestao-impcg-autorizacoes`

---

## Phase 2: Foundational

**Purpose**: schema, nav e clientes — bloqueia as stories

**⚠️ CRITICAL**: stories só depois desta fase

- [ ] T003 Add `ImpcgParseStatus` and models `ImpcgAuthorization`, `ImpcgAuthorizationItem`, `ImpcgSourceMessage`, `ImpcgIngestState` plus `Company` relations in `prisma/schema.prisma`
- [ ] T004 Create expand-only migration `prisma/migrations/20260830120000_add_impcg_authorization/migration.sql`
- [ ] T005 Update `EXPECTED_MIGRATION` and SQL SHA in `scripts/verify-production-migration-window.cjs` and the assert in `scripts/test-production-migration-window.cjs`
- [ ] T006 [P] Add Gestão / IMPCG to `src/lib/navigation.ts` (`PAGE_GROUPS`, `API_PREFIX_TO_PAGES` `/api/gestao` → `/gestao/impcg`)
- [ ] T007 [P] Add Gestão / IMPCG to `src/components/SidebarNav.tsx` (`PAGE_LABELS` + `buildNavItems`)
- [ ] T008 [P] Add Graph app-only mail client in `src/lib/graph-mail-client.ts` (client credentials, list+attachments, timeout, no secrets in logs)
- [ ] T009 [P] Add OneDrive upload, folder ensure and content download in `src/lib/onedrive-client.ts`
- [ ] T010 Add `impcg-mail-ingest` to `src/lib/background-service-health.ts` and lock helper key in `src/lib/postgres-advisory-lock.ts`
- [ ] T011 Add Alpine `poppler-utils`, `tesseract-ocr` and `tesseract-ocr-data-por` in `Dockerfile` runner stage

**Checkpoint**: `npx prisma generate` ok; nav paths válidos; sem rotas ainda

---

## Phase 3: User Story 1 — Ver autorizações (P1) 🎯 MVP

**Goal**: lista + popup + PDF + 403. Pode usar seed/fixture no banco.

**Independent Test**: usuário com página vê colunas e abre popup; sem
página → 403; vazio → “Nenhuma autorização IMPCG.”

### Tests (FIRST — must fail)

- [ ] T012 [P] [US1] ACL 403 tests for list/detail/file in `src/lib/__tests__/impcg-acl.test.ts`
- [ ] T013 [P] [US1] Empty-list and sort contract assertions in `src/lib/__tests__/impcg-list-contract.test.ts`

### Implementation

- [ ] T014 [US1] Read/list helpers in `src/lib/impcg/store.ts` (company-scoped, Decimal as string)
- [ ] T015 [US1] `GET /api/gestao/impcg` in `src/app/api/gestao/impcg/route.ts`
- [ ] T016 [P] [US1] `GET /api/gestao/impcg/[id]` and `GET .../[id]/arquivo` in `src/app/api/gestao/impcg/[id]/route.ts` and `src/app/api/gestao/impcg/[id]/arquivo/route.ts`
- [ ] T017 [US1] Page shell `src/app/(painel)/gestao/impcg/page.tsx` (dynamic client like relatórios)
- [ ] T018 [US1] Table + `Modal` + iframe PDF + badges in `src/app/(painel)/gestao/impcg/page-client.tsx` (Esc/`useModalBackButton`)

**Checkpoint**: com uma linha no banco, AC-001 a AC-004 passam

---

## Phase 4: User Story 2 — E-mail vira arquivo e linha (P1)

**Goal**: coleta, upload, parse, dedup, sem upsert se upload falhar

**Independent Test**: mesmo Message-ID / mesmo nº → 1 linha; 17673
fecha `12550.00`; upload mock falho → 0 autorizações

### Tests (FIRST — must fail)

- [ ] T019 [P] [US2] Parser fixture 17673 in `src/lib/__tests__/impcg-parse-oficio.test.ts`
- [ ] T020 [P] [US2] Dedup Message-ID and oficio number in `src/lib/__tests__/impcg-ingest-dedup.test.ts`
- [ ] T021 [P] [US2] Upload failure does not upsert in `src/lib/__tests__/impcg-upload-gate.test.ts`

### Implementation

- [ ] T022 [P] [US2] PDF text/OCR seam in `src/lib/impcg/extract-pdf-text.ts`
- [ ] T023 [US2] Oficio parser (centavos → Decimal) in `src/lib/impcg/parse-oficio.ts`
- [ ] T024 [US2] Ingest orchestrator (two mailboxes, upload-then-upsert, rank upgrade) in `src/lib/impcg/ingest.ts`
- [ ] T025 [US2] Persist helpers (upsert, source message, items replace on upgrade) in `src/lib/impcg/store.ts`
- [ ] T026 [US2] Wire Graph + OneDrive fakes in ingest tests (`src/lib/__tests__/impcg-ingest-dedup.test.ts`, `src/lib/__tests__/impcg-upload-gate.test.ts`)

**Checkpoint**: AC-005 a AC-009 e FAIL-001–004 cobertos por teste

---

## Phase 5: User Story 3 — Passado e atualização (P2)

**Goal**: backfill na primeira coleta; POST sync editor; viewer sem botão

**Independent Test**: histórico N ofícios → N linhas; viewer 403 no
POST; cabeçalho mostra `lastCollectedAt`

### Tests (FIRST — must fail)

- [ ] T027 [P] [US3] Viewer forbidden on POST sync in `src/lib/__tests__/impcg-acl.test.ts`
- [ ] T028 [P] [US3] Ingest sets `backfillCompletedAt` / `lastSuccessAt` in `src/lib/__tests__/impcg-ingest-dedup.test.ts`

### Implementation

- [ ] T029 [US3] `POST /api/gestao/impcg/sync` in `src/app/api/gestao/impcg/sync/route.ts` (editor+, advisory lock → 409)
- [ ] T030 [US3] Start interval from `src/lib/bootstrap.ts` calling `src/lib/impcg/ingest.ts` (15 min, respects `QLMED_DISABLE_BACKGROUND_SERVICES`)
- [ ] T031 [US3] “Atualizar agora” + last collected in `src/app/(painel)/gestao/impcg/page-client.tsx` when `canSync`

**Checkpoint**: AC-010 a AC-012

---

## Phase 6: Polish

- [x] T032 Run `npm run docs:validate`, `npx tsc --noEmit`, `npm run lint`, `npm test`, `npm run db:migrate:verify`, `npm run db:reconcile:verify` and record evidence
  Evidence 2026-08-30: docs 117 files/32 IDs; tsc-ok; eslint exit 0; vitest 60 passed / 3 skipped, 418 passed / 4 skipped (2.28s); migrate verify applied `20260830120000_add_impcg_authorization` then “No difference detected”; reconcile verify “No difference detected”. SHA migration.sql = `9fd07f6790362c64811f87d35ac5c5d36a60b7491b2666414332612bb7d55933`.
- [x] T033 [P] `graphify update` on the worktree after code changes
  Evidence 2026-08-30: `graphify update .` no worktree → 4306 nodes, 8784 edges, 364 communities.
- [ ] T034 Confirm quickstart.md scenarios against the running app (lista, popup, 403)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup**: imediato
- **Foundational**: depois do Setup — bloqueia stories
- **US1 e US2**: depois do Foundational; US1 não precisa do ingest real
  (seed); US2 não precisa da UI
- **US3**: depois de US2 (mesma função de ingest)
- **Polish**: depois das stories desejadas

### User Story Dependencies

- **US1**: só Foundational + store de leitura
- **US2**: Foundational; independente da UI
- **US3**: US2 (POST chama ingest)

### Parallel Opportunities

- T006 / T007 / T008 / T009 em paralelo após T003–T005
- T012 / T013 juntos; T019 / T020 / T021 juntos
- US1 UI (T017–T018) em paralelo com US2 ingest depois do foundation

---

## Parallel Example: User Story 2

```text
T019 parser 17673
T020 dedup
T021 upload gate
```

---

## Implementation Strategy

### MVP

1. Setup + Foundational
2. US1 (lista/popup com seed) — demo da tela
3. US2 (coleta) — valor do pedido
4. US3 (botão + backfill)
5. Polish + land

Não mergear só com spec/plan.
