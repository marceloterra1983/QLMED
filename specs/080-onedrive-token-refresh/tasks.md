# Tasks: SPEC-080 — token Graph expirado

**Input**: `specs/080-onedrive-token-refresh/`

## Phase 1: Foundation

- [x] T001 Spec, plan, research e feature.json
- [x] T002 `src/lib/onedrive-auth.ts` — bind, lock, reset de teste

## Phase 2: User Story 1 (OneDrive)

- [x] T003 Testes 401 retry + force refresh
- [x] T004 `fetchMicrosoftGraph` e uso em graph/client
- [x] T005 `ensureValidOneDriveAccessToken({ force })` + bind + mutate

## Phase 3: User Story 2 (Graph Mail)

- [x] T006 `getGraphAppOnlyToken({ force })` + retry em `graphJson`
- [x] T007 Teste `graph-mail-token-retry.test.ts`
- [x] T008 Unificar listagem `$search` em `graphJson`

## Phase 4: Polish

- [x] T009 `docs:validate`, `tsc --noEmit`, testes do recorte
- [x] T010 Chamadas seguintes ao Graph reusam o token renovado (P1 Codex)
