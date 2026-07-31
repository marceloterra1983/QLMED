# Implementation Plan: Prisma schema unification

**Status:** Phase 11 and the satellite-store migrations are complete. Remaining:
residual FKs and `Float`→`Decimal` under a separately authorized plan
(ADR-0006).

## Sequence

1. Reconcile the exact satellite-table inventory against current schema and DB
   evidence in development.
2. Create/review a non-destructive baseline migration.
3. Replay the complete migration history in isolated PostgreSQL.
4. Migrate stores incrementally to Prisma Client with regression tests.
5. Document expand/contract and application rollback semantics.
6. Stop at the human checkpoint before each production migration.

## Constitution gates

- Use `qlmed_dev`/CI only during automated work.
- Run docs validation, Prisma validation, migration replay, reconciliation,
  typecheck, lint, tests and build.
- Never run `prisma migrate deploy` against production without a separate
  explicit authorization.
- Preserve the current application compatibility window.

## Traceability

| Requirement / AC | Evidence |
|------------------|----------|
| FR-001/FR-002, AC-001/AC-002 | migration replay and drift verification |
| FR-003/FR-004, AC-003/AC-004 | focused store tests and source audit |
| NFR-002, AC-005/AC-006 | rollout/rollback documentation and checkpoint |
