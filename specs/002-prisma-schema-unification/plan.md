# Implementation Plan: Prisma schema unification

**Status:** Satellite-store migrations are complete (see [`tasks.md`](./tasks.md)). Remaining:
residual FKs and `Float`→`Decimal` under a separately authorized plan
(ADR-0006). The current persistence boundary is ADR-0007: one protected
persistent `postgres` database through `DATABASE_URL`, with `qlmed_ci` reserved
for disposable CI replay and tests.

## Sequence

1. Reconcile the exact satellite-table inventory against the canonical schema
   and the CI database contract.
2. Create/review a non-destructive baseline migration.
3. Replay the complete migration history in isolated PostgreSQL.
4. Migrate stores incrementally to Prisma Client with regression tests.
5. Document expand/contract and application rollback semantics.
6. Stop at the human checkpoint before each production migration.
7. Keep the configuration guard, Compose, CI and recovery-receipt contract in
   sync; do not provision `qlmed_dev` or another persistent database.

## Constitution gates

- Use the disposable CI database `qlmed_ci` for automated replay and tests;
  the persistent runtime has only the protected canonical `postgres` database
  through `DATABASE_URL`.
- Do not add `qlmed_dev` or parallel database URL aliases.
- The root Compose file must consume a protected `DATABASE_URL` and must not
  create a persistent local PostgreSQL service; the `server-backup` `qlmed`
  receipt gate remains external to application code.
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
| FR-005/FR-006, AC-007/AC-008/AC-009 | canonical resolver, Compose/CI guards, ADR-0007 and backup-receipt documentation |
