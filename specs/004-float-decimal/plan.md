# Implementation Plan: Float→Decimal (expand/contract)

**Status:** Active program; this cycle authorizes documentation plus the first
expand (`InvoiceDuplicata`). Production deploy is not authorized.

**Branch**: `feat/004-float-decimal` | **Spec**: [spec.md](./spec.md)

## Summary

Convert remaining Prisma `Float` columns to `Decimal` with expand/contract.
SPEC-002 excludes this work. Verification is `qlmed_ci` only. ROLE-001: only
a human operator may apply production migrations. Scorecard `money-float`
counts every `Float` (max 5); one model cannot pass it.

## Technical Context

**Language/Version**: TypeScript on Node 22 (CI image) / Next.js 15 App Router

**Primary Dependencies**: Prisma 7.9.1, PostgreSQL, Vitest

**Storage**: Canonical `postgres` via `DATABASE_URL`; disposable `qlmed_ci`

**Testing**: `docs:validate`, `tsc --noEmit`, `lint`, `npm test`; schema gates
`db:migrate:verify` and `db:reconcile:verify` on `qlmed_ci`

**Constraints**: No `db push`, `migrate dev`, or `migrate deploy` against
canonical/production from an agent session. Expand must stay compatible with
the previous application image.

## Constitution Check

- Principle I: dual-write and migration replay have automated evidence.
- Principle III: versioned Prisma migrations; expand/contract; `qlmed_ci` only.
- Principle V: no `.env`, backups, or secrets in this work.
- Principle VI: this spec is the Float→Decimal contract; SPEC-002 stays closed.
- Quality gates include schema verify on `qlmed_ci` for expand PRs.
- No workflow deploys or touches production in this cycle.

## Sequence

1. Land this spec (contract, inventory, ROLE-001, out of scope).
2. Expand `InvoiceDuplicata` with three nullable Decimal sidecars.
3. Dual-write from `invoice-duplicata-store` with tests.
4. Prove replay/drift on `qlmed_ci`.
5. **Stop for human authorization** before any production apply.
6. Later PRs: remaining 77 columns, then contract, then HTTP types.

## Inventory (80 `Float`)

| Category | Count | First slice |
|---|---|---|
| Money amounts | 28 | `InvoiceDuplicata`: `dupValor`, `faturaValorOriginal`, `faturaValorLiquido` (3) |
| Tax amounts | 33 | later PRs |
| Rates / alíquotas | 13 | later PRs |
| Quantities | 5 | later PRs |
| Confidence | 1 | `ProductRegistry.anvisaConfidence` — later PR |

## Project Structure

```text
specs/004-float-decimal/
├── spec.md
├── plan.md
└── tasks.md
prisma/schema.prisma
prisma/migrations/<timestamp>_expand_invoice_duplicata_decimal/migration.sql
src/lib/invoice-duplicata-store.ts
src/lib/__tests__/satellite-stores-prisma.test.ts
```

## Traceability

| Requirement / AC | Evidence |
|---|---|
| FR-001/AC-001/AC-002 | this spec + tasks inventory |
| FR-002/AC-003/AC-005 | versioned expand migration + `qlmed_ci` verify |
| FR-003/AC-007/AC-008 | store dual-write + focused tests |
| ROLE-001/AC-006 | no prod deploy in this cycle; human stop |
| FR-005/AC-009 | scorecard still FAIL at 77 Floats |
