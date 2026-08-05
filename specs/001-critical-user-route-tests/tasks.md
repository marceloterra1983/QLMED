# Tasks: Critical user administration route tests

## Specification and analysis

- [x] **T001 [US1-US3] [FR-001..FR-006/AC-001..AC-006]** Record the approved
  behavior in `specs/001-critical-user-route-tests/spec.md`.
- [x] **T002 [US1-US3] [NFR-001..NFR-003]** Document the isolated mock strategy
  and exact verification commands in `plan.md` and `quickstart.md`.
- [x] **T003 [US1-US3] [ALL]** Analyze spec/plan/task coverage before code.

## Test implementation

- [x] **T004 [US1] [FR-001/FR-002/AC-001/AC-002]** Add unauthenticated and
  forbidden tests in `src/lib/__tests__/users-route.test.ts`.
- [x] **T005 [US2] [FR-003/AC-003/AC-004]** Add self-demotion and
  self-deactivation tests in the same file.
- [x] **T006 [US3] [FR-004..FR-006/AC-005/AC-006]** Add session invalidation,
  response projection and audit attribution tests.

## Verification

- [x] **T007 [US1-US3] [SC-001/SC-002]** Run focused Vitest (8/8 passed).
- [x] **T008 [US1-US3] [SC-003]** Run docs validation, typecheck, lint and full
  unit tests.
- [x] **T009 [US1-US3] [SC-003/SC-004]** Run production build and verify that
  no production source file changed.
