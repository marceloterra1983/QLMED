---
id: SPEC-002
status: draft
owner: QLMED
related_decisions: []
affected_modules:
  - prisma
  - persistence-stores
  - deployment
---

# Feature Specification: Prisma schema unification

## Problem

QLMED currently has satellite tables represented through `@@ignore` models and
legacy runtime DDL/store helpers. This creates two schema authorities and weakens
migration, type-safety and rollback reasoning. GSD Phase 11 already defines the
delivery sequence; this spec is the behavioral and safety contract.

## User scenarios

### US1 — Reproducible schema (P1)

As an operator, I need a fresh development database to reach the expected schema
using versioned Prisma migrations only.

- **AC-001**: Replaying migrations in an empty CI/dev database succeeds.
- **AC-002**: `prisma migrate diff` reports no unexpected drift afterward.

### US2 — Typed persistence migration (P1)

As a developer, I need the selected satellite store to use Prisma Client rather
than runtime table creation and raw access for ordinary CRUD.

- **AC-003**: The pilot store contains no runtime `CREATE TABLE` path.
- **AC-004**: Its existing behavior remains covered by tests.

### US3 — Safe rollout and rollback (P1)

As an operator, I need schema rollout to remain compatible with the previous app
revision until the contract phase is explicitly completed.

- **AC-005**: The plan documents expand/contract order and compatibility window.
- **AC-006**: Application rollback consequences are explicit; no plan claims
  that an image rollback reverses a database migration.

## Requirements

- **FR-001**: Prisma schema and migrations become canonical for the selected
  satellite tables.
- **FR-002**: Baseline work preserves existing production data and migration
  history.
- **FR-003**: Store migration proceeds one table at a time with tests and an
  observation checkpoint.
- **FR-004**: Runtime DDL is removed only after the corresponding migration is
  proven in development and CI.
- **ROLE-001**: Only an explicitly authorized operator may execute production
  migration deployment.
- **OWN-001**: Development verification uses `qlmed_dev` or CI PostgreSQL, never
  production.
- **NFR-001 Security**: No database URL or credential appears in specs, logs or
  commits.
- **NFR-002 Reliability**: Every step defines backup, compatibility, validation
  and rollback boundaries.
- **NFR-003 Observability**: Migration and application health evidence is
  recorded without sensitive row data.

## Out of scope

- Executing production migrations during specification/planning.
- Converting all stores in one release.
- Destructive column/table removal before an observation window.
- Modifying production backup policy.

## Related delivery plan

- `.planning/phases/11-unifica-o-de-schema/11-01-PLAN.md`
- `.planning/phases/11-unifica-o-de-schema/11-02-PLAN.md`
- `.planning/phases/11-unifica-o-de-schema/11-03-PLAN.md`

