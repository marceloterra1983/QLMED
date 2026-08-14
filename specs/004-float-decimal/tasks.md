# Tasks: Float→Decimal (expand/contract)

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Spec Kit contract (US1)

- [x] T001 [US1] [FR-001/AC-001] Author SPEC-004 with expand/contract, `qlmed_ci`
  only, ROLE-001 and an explicit human stop before production.
- [x] T002 [US1] [AC-002] Slice the 80 `Float` columns (28 money, 33 tax,
  13 rate, 5 quantity, 1 confidence) in plan/tasks.

## Phase 2: Expand InvoiceDuplicata (US2/US4) — next PR

- [ ] T003 [US2] [FR-002/AC-003] Add nullable Decimal sidecar columns beside
  `dupValor`, `faturaValorOriginal`, `faturaValorLiquido` in
  `prisma/schema.prisma` (`InvoiceDuplicata`).
- [ ] T004 [US2] [FR-002] Author a versioned additive migration under
  `prisma/migrations/` (no DROP/rename of Float columns).
- [ ] T005 [US4] [FR-003/AC-007] Dual-write Decimal sidecars in
  `src/lib/invoice-duplicata-store.ts`.
- [ ] T006 [US4] [AC-008/TEST-002] Extend
  `src/lib/__tests__/satellite-stores-prisma.test.ts` for dual-write.
- [ ] T007 [US3] [AC-005/TEST-003] Prove `npm run db:migrate:verify` and
  `npm run db:reconcile:verify` on `qlmed_ci`.
- [ ] T008 [US3] [ROLE-001/AC-006] **STOP.** Do not `migrate deploy` to
  production or the canonical database. Contract + remaining 77 columns are
  later PRs. Scorecard remains FAIL (80 Floats until contract, max 5).

## Later PRs (not this cycle)

- [ ] T009 [US1] Remaining 25 money `Float` columns (expand, then observe).
- [ ] T010 [US1] 33 tax amount columns.
- [ ] T011 [US1] 13 alíquota columns.
- [ ] T012 [US1] 5 quantity columns + `anvisaConfidence`.
- [ ] T013 Contract: drop Float columns after the observation window; HTTP
  types may then leave `number` on the border.

## Checkpoint

After T008 the program is specified and the first expand is a separate PR.
Human operator owns production apply.
