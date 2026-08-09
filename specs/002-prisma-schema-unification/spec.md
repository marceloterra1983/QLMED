---
id: SPEC-002
status: active
owner: QLMED
related_decisions:
  - ADR-0006
  - ADR-0007
affected_modules:
  - prisma
  - persistence-stores
  - deployment
---

# Feature Specification: Prisma schema unification

## Problem

Satellite tables used to be dual-sourced via `@@ignore` / runtime `ensure*Table`
DDL alongside Prisma. Runtime DDL and `@@ignore` are already gone from `src/` and
`prisma/schema.prisma`, and all satellite stores use Prisma Client for ordinary
CRUD. Expand/contract rollout and rollback discipline are delivered in this
SDD (plan + T005; see `docs/architecture/data.md`). Residual work is FKs /
`@relation` on satellite models and `Float`→`Decimal` for money precision.
GSD Phase 11 defines the completed delivery sequence; this spec is the
behavioral and safety contract.

## User scenarios

### US1 — Reproducible schema (P1)

As an operator, I need the canonical QLMED database to reach the expected
schema using versioned Prisma migrations only, while CI proves replay in a
disposable PostgreSQL service.

- **AC-001**: Replaying migrations in the empty CI database `qlmed_ci` succeeds.
- **AC-002**: `prisma migrate diff` reports no unexpected drift afterward.

### US2 — Typed persistence migration (P1)

As a developer, I need satellite stores to use Prisma Client rather than
runtime table creation and raw access for ordinary CRUD.

- **AC-003**: Satellite stores contain no runtime `CREATE TABLE` path or raw
  SQL for ordinary CRUD.
- **AC-004**: Their existing behavior remains covered by tests.

### US3 — Safe rollout and rollback (P1)

As an operator, I need schema rollout to remain compatible with the previous app
revision until the contract phase is explicitly completed.

- **AC-005**: The plan documents expand/contract order and compatibility window.
- **AC-006**: Application rollback consequences are explicit; no plan claims
  that an image rollback reverses a database migration.

### US4 — Single canonical persistence boundary (P1)

As the sole maintainer, I need the application and its automated checks to use
one documented persistence boundary, so local setup does not depend on an
unavailable second database and cannot silently select an arbitrary target.

- **AC-007**: The configuration guard accepts only `DATABASE_URL` targeting the
  persistent `postgres` database or the disposable CI database `qlmed_ci`, and
  rejects `qlmed_dev`, arbitrary database names and parallel URL aliases without
  echoing credentials.
- **AC-008**: The root Compose file consumes a protected `DATABASE_URL` and
  does not provision a persistent PostgreSQL service; CI creates `qlmed_ci` for
  replay/tests only.
- **AC-009**: The documentation identifies the `server-backup` `qlmed` set and
  its current receipt as the recovery gate; application code does not read
  backup files or backup credentials.

## Requirements

- **FR-001**: Prisma schema and migrations become canonical for the selected
  satellite tables.
- **FR-002**: Baseline work preserves existing production data and migration
  history.
- **FR-003**: Each migrated store retains focused tests and explicit Prisma
  model mappings.
- **FR-004**: Runtime DDL is removed only after the corresponding migration is
  proven in CI and, when required, in an explicitly authorized canonical
  environment; no second persistent development database is assumed.
- **FR-005**: Application startup, Prisma configuration and database scripts
  share one fail-closed canonical database resolver.
- **FR-006**: Compose, CI and operator-facing documentation expose the same
  persistent/ephemeral boundary and do not create a second persistent database.
- **ROLE-001**: Only an explicitly authorized operator may execute production
  migration deployment.
- **OWN-001**: The persistent runtime has one canonical `DATABASE_URL` targeting
  the production `postgres` database; no arbitrary database name, `qlmed_dev`
  or parallel URL aliases are supported. Automated verification uses the
  disposable CI PostgreSQL service, and any operator-authorized check against
  the canonical database requires a current `server-backup` receipt.
- **NFR-001 Security**: No database URL or credential appears in specs, logs or
  commits.
- **NFR-002 Reliability**: Every step defines backup, compatibility, validation
  and rollback boundaries.
- **NFR-003 Observability**: Migration and application health evidence is
  recorded without sensitive row data.

## Test strategy

- **TEST-001**: Run `npm run docs:validate`, `npx tsc --noEmit` and
  `npm run lint` for specification and implementation consistency.
- **TEST-002**: Run focused satellite-store tests and the relevant integration
  tests to prove existing persistence behavior and Prisma mappings remain
  covered.
- **TEST-003**: Run `npm run db:migrate:verify` and
  `npm run db:reconcile:verify` to prove migration replay and drift detection
  against the disposable CI database `qlmed_ci`.
- **TEST-004**: Run `npm test`, `npm run test:integration` and `npm run build`
  for the complete regression and runtime checks required for database work.

## Failure cases

- **FAIL-001**: Migration replay fails in the empty `qlmed_ci` database; the
  rollout is stopped and the migration evidence is treated as unsuccessful.
- **FAIL-002**: Reconciliation reports unexpected schema drift; the change is
  not considered canonical and must not proceed to deployment.
- **FAIL-003**: A database URL targets `qlmed_dev`, an arbitrary database or a
  parallel alias; configuration fails closed without exposing credentials.
- **FAIL-004**: A rollout is incompatible with the previous application
  revision or rollback would require reversing a database migration; retain
  the compatible state and follow the documented expand/contract or rollback
  boundary.
- **FAIL-005**: A focused persistence or integration test regresses; the
  affected store change is not accepted until the behavior is restored and
  covered by evidence.

## Out of scope

- Executing production migrations during specification/planning.
- Adding residual FKs or converting `Float` money fields to `Decimal` in this
  documentation-only reconciliation.
- Destructive column/table removal before an observation window.
- Modifying production backup policy.
- Creating a second persistent QLMED database or migrating historical records
  that mention the former `qlmed_dev` convention.

## Related delivery plan

The GSD delivery plans for this spec (`.planning/phases/11-unifica-o-de-schema/`)
were removed once `governance.yaml` set `gsd.mode=disabled`. Task traceability
lives in `specs/002-prisma-schema-unification/tasks.md`. To read the original
sequence, resolve the removing commit by path so the reference survives any
rebase:

```bash
P=.planning/phases/11-unifica-o-de-schema/11-01-PLAN.md
git show "$(git log --diff-filter=D --format=%H -1 -- "$P")^:$P"
```
