---
id: SPEC-004
status: active
owner: QLMED
related_decisions:
  - ADR-0006
  - ADR-0007
affected_modules:
  - prisma
  - persistence-stores
  - financeiro
---

# Feature Specification: Float→Decimal (expand/contract)

## Problem

SPEC-002 explicitly excludes converting Prisma `Float` money fields to
`Decimal`. ADR-0006 already requires a separate expand/contract plan. The
scorecard track `money-float` counts **any** remaining `Float` in
`prisma/schema.prisma` (maximum 5). The schema currently has 80 `Float`
columns (28 money, 33 tax, 13 rate, 5 quantity, 1 confidence), so one model
cannot pass the scorecard.

This specification is the program contract. Phase 1 of delivery is the
smallest honest slice already aligned with Decimal cores
(`Invoice.totalValue`, `FinanceiroDuplicataManualInstallment`): expand
`InvoiceDuplicata` with three sidecar Decimal columns. Later PRs cover the
remaining 77 columns. Production deploy is out of this cycle (ROLE-001).

## User scenarios

### US1 — Program contract (P1)

As a maintainer, I need a Spec Kit feature that authorizes Float→Decimal
work without reopening SPEC-002's closed satellite-store scope.

- **AC-001**: This spec names expand/contract, `qlmed_ci`-only verification,
  ROLE-001, and an explicit human stop before production.
- **AC-002**: Tasks slice the 80 `Float` columns by category (money, tax,
  rate, quantity, confidence).

### US2 — Expand without breaking the previous image (P1)

As an operator, I need new Decimal columns added beside existing Float
columns so the current application revision and its rollback image keep
working.

- **AC-003**: Expand migrations are additive (nullable Decimal sidecars or
  equivalent non-destructive DDL). They do not drop or rename Float columns
  in the same change.
- **AC-004**: Application rollback does not reverse a successful migration.

### US3 — Prove replay only on disposable CI (P1)

As the sole maintainer, I need migration evidence on `qlmed_ci`, never on
the canonical `postgres` database from an agent session.

- **AC-005**: `npm run db:migrate:verify` and `npm run db:reconcile:verify`
  run against disposable `qlmed_ci`.
- **AC-006**: This cycle does not run `prisma migrate deploy` against
  production or the canonical database.

### US4 — First money slice: InvoiceDuplicata (P1)

As a developer, I need the first expand to cover the three money columns on
`InvoiceDuplicata` (`dupValor`, `faturaValorOriginal`, `faturaValorLiquido`)
and dual-write them from the store.

- **AC-007**: The store writes the new Decimal columns alongside the existing
  Float values.
- **AC-008**: Focused tests cover the dual-write. HTTP/API money on the
  border may remain `number` until a later contract PR.
- **AC-009**: After this slice the scorecard still FAILs (`80` → `77`, max 5).

## Requirements

- **FR-001**: Prisma schema changes for money precision MUST follow
  expand/contract; Float columns remain until an explicit contract PR.
- **FR-002**: Each expand MUST ship a versioned migration under
  `prisma/migrations/`.
- **FR-003**: Dual-write MUST keep Float and Decimal representations of the
  same business amount during the compatibility window.
- **FR-004**: HTTP contracts MAY keep `number` on the border in this cycle;
  parsing XML/`Number(invoice.totalValue)` waits for schema Decimal on those
  fields.
- **FR-005**: Scorecard `money-float` continues to count every remaining
  `Float`; a passing scorecard requires ≤5 residual Floats, not a single
  model.
- **ROLE-001**: Only an explicitly authorized operator may execute production
  migration deployment.
- **OWN-001**: Automated verification uses disposable `qlmed_ci`. The
  persistent runtime remains the protected canonical `postgres` database
  through `DATABASE_URL` (ADR-0007).
- **NFR-001 Security**: No database URL or credential appears in specs, logs
  or commits.
- **NFR-002 Reliability**: Every expand defines compatibility with the
  previous application image; rollback of the image does not reverse DDL.
- **NFR-003 Observability**: Migration evidence is recorded without sensitive
  row data.

## Test strategy

- **TEST-001**: `npm run docs:validate`, `npx tsc --noEmit`, `npm run lint`.
- **TEST-002**: Focused store tests for dual-write on `InvoiceDuplicata`.
- **TEST-003**: `npm run db:migrate:verify` and `npm run db:reconcile:verify`
  on `qlmed_ci`.
- **TEST-004**: `npm test` for the complete unit regression of the change.

## Failure cases

- **FAIL-001**: Migration replay fails on empty `qlmed_ci`; stop.
- **FAIL-002**: Reconciliation reports unexpected drift; do not treat the
  schema as canonical.
- **FAIL-003**: An expand drops or renames a Float column still read by the
  previous image; revert to additive expand.
- **FAIL-004**: An agent or CI job targets the canonical/production database
  for `migrate deploy`; treat as unauthorized.
- **FAIL-005**: Dual-write omits Decimal sidecars or writes a different
  amount than the Float column.

## Out of scope

- Production `prisma migrate deploy` in this cycle.
- Contract phase (drop Float columns, switch HTTP types to Decimal).
- The remaining 77 `Float` columns after `InvoiceDuplicata`.
- Residual FKs/`@relation` (still ADR-0006 item 1, not this spec's first PR).
- Next.js 16 / Tailwind 4.
- Changing SPEC-002's closed satellite-store CRUD scope.

## Roles and ownership

- **Maintainer** owns Spec Kit artifacts and CI evidence.
- **Operator (human)** owns production migration authorization (ROLE-001).
- **AI agents** MUST NOT deploy, run `migrate deploy` against canonical
  postgres, or edit `.env`.
