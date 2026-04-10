---
phase: 05-code-deduplication
plan: 02
subsystem: financeiro
tags: [deduplication, refactor, financeiro]
dependency_graph:
  requires: [05-01]
  provides: [financeiro-shared]
  affects: [contas-pagar, contas-receber]
tech_stack:
  added: []
  patterns: [direction-parametrized-handler, thin-wrapper-routes]
key_files:
  created:
    - src/lib/financeiro-shared.ts
  modified:
    - src/app/api/financeiro/contas-pagar/route.ts
    - src/app/api/financeiro/contas-receber/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/installments/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/installments/route.ts
decisions:
  - Direction config object pattern for parametrizing pagar/receber differences
  - Party field renaming at response boundary (internal uses generic partyNome/partyCnpj)
metrics:
  duration: 368s
  completed: "2026-04-10T02:35:00Z"
  tasks: 2
  files: 7
requirements: [DUP-02]
---

# Phase 05 Plan 02: Unify Financeiro Contas-Pagar/Receber Summary

Shared financeiro-shared.ts with direction-parametrized handlers replacing 1575 lines of duplicated code across 6 route files, reducing routes to 16-21 line thin wrappers.

## What Was Done

### Task 1: Create financeiro-shared.ts with parametrized logic
**Commit:** e36616f

Created `src/lib/financeiro-shared.ts` (912 lines) with:
- `handleContasGet(company, direction, searchParams)` - main list route logic
- `handleInvoiceGet(invoiceId, company, direction)` - invoice detail logic
- `handleInstallmentsPut(invoiceId, company, body)` - installment save logic
- `DIRECTION_CONFIG` object mapping pagar/receber differences (party field names, invoice directions, allowed tags, sort fields)
- All shared utilities (roundMoney, toEpochDay, parseMoney, getStatusFromVencimento, etc.)
- Helper functions for fetching base duplicatas, expanding with manual installments, and fetching overrides

### Task 2: Convert 6 route files to thin wrappers
**Commit:** 58579ef

Rewrote all 6 financeiro route files as thin wrappers:
| File | Before | After |
|------|--------|-------|
| contas-pagar/route.ts | 387 | 16 |
| contas-receber/route.ts | 381 | 16 |
| contas-pagar/invoice/[invoiceId]/route.ts | 235 | 18 |
| contas-receber/invoice/[invoiceId]/route.ts | 222 | 18 |
| contas-pagar/invoice/.../installments/route.ts | 198 | 21 |
| contas-receber/invoice/.../installments/route.ts | 198 | 21 |
| **Total** | **1621** | **110** |

**Reduction: 93% fewer lines in route files** (1511 lines removed, consolidated into financeiro-shared.ts).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed accent in Compra Importacao tag**
- **Found during:** Task 1
- **Issue:** Initial implementation used `Compra Importacao` (no accent) but `cfop.ts` and the original route files use `Compra Importacao` with accent (`Compra Importacao` -> should be `Compra Importação`)
- **Fix:** Updated all 3 occurrences in financeiro-shared.ts to use `Compra Importação`
- **Files modified:** src/lib/financeiro-shared.ts
- **Commit:** 58579ef (included in Task 2 commit)

## Decisions Made

1. **Direction config object pattern**: Used a `DIRECTION_CONFIG` constant mapping each direction to its field names, invoice directions, allowed tags, and sort field names. This centralizes all pagar/receber differences in one place.
2. **Generic party fields internally**: The shared module uses generic `partyNome`/`partyCnpj` internally and renames to direction-specific names (`emitenteNome`/`clienteNome`) only at the response boundary via `renamePartyFields()`.

## Verification

- `npx tsc --noEmit` passes (0 errors)
- `npm run build` succeeds
- All 6 route files under 40 lines (16-21 lines each)
- financeiro-shared.ts contains all business logic parametrized by direction
- No duplicate code between contas-pagar and contas-receber routes
- contas-pagar/override/route.ts left unchanged (unique to pagar)

## Known Stubs

None - all logic is fully wired.

## Self-Check: PASSED
