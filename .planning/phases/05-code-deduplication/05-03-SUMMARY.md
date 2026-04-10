---
phase: 05-code-deduplication
plan: 03
subsystem: api/contacts
tags: [deduplication, refactoring, suppliers, customers]
dependency_graph:
  requires: [05-01]
  provides: [contact-shared-handlers, contact-details-shared-handlers]
  affects: [suppliers-api, customers-api]
tech_stack:
  added: []
  patterns: [parametrized-handler-pattern, contacttype-config-object]
key_files:
  created:
    - src/lib/contact-shared.ts
    - src/lib/contact-details-shared.ts
  modified:
    - src/app/api/suppliers/route.ts
    - src/app/api/customers/route.ts
    - src/app/api/suppliers/details/route.ts
    - src/app/api/customers/details/route.ts
decisions:
  - Split shared logic into two modules (contact-shared.ts for list, contact-details-shared.ts for details) to keep each focused
  - Customer-specific city logic and supplier-specific productTypes logic parametrized via config flags (hasCity, hasProductTypes, hasSaleFilter)
  - Query schema unified with limit max 500 (was 100 for suppliers, 500 for customers) -- using the more permissive value
metrics:
  duration: 388s
  completed: "2026-04-10T02:35:16Z"
  tasks: 2
  files: 6
---

# Phase 05 Plan 03: Unify Suppliers/Customers API Routes Summary

Unified 4 API route files (1,620 lines total) into 2 shared modules + 4 thin wrappers (96 lines total), eliminating ~80% code duplication between supplier and customer entity types.

## What Was Done

### Task 1: Create contact-shared.ts and refactor API routes
- Created `src/lib/contact-shared.ts` (388 lines) with `handleContactList()` parametrized by `ContactType` ('supplier' | 'customer')
- Created `src/lib/contact-details-shared.ts` (550 lines) with `handleContactDetails()` parametrized by `ContactType`
- Both modules use config objects mapping contact type to direction, CNPJ field, name field, XML party path, and type-specific feature flags
- Rewrote all 4 route files as thin wrappers (22-26 lines each): auth check + delegate to shared handler
- **Commit:** 2229660

### Task 2: Verify modals use shared imports from DUP-01
- Confirmed both `SupplierDetailsModal.tsx` and `CustomerDetailsModal.tsx` import `parseCnpjResponse` from `@/lib/cnpj-utils` and `validateIE` from `@/lib/ie-validation`
- Grep for inline function definitions returned EXIT:1 (no matches) -- DUP-01 already completed this work
- No changes needed, no commit

## Line Count Reduction

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| suppliers/route.ts | 313 | 22 | -93% |
| customers/route.ts | 350 | 22 | -94% |
| suppliers/details/route.ts | 477 | 26 | -95% |
| customers/details/route.ts | 480 | 26 | -95% |
| **Total route lines** | **1,620** | **96** | **-94%** |

Shared logic moved to contact-shared.ts (388 lines) + contact-details-shared.ts (550 lines) = 938 lines total.
Net reduction: 1,620 - 96 - 938 = **586 lines eliminated** (duplicated code removed).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Created separate contact-details-shared.ts instead of putting everything in contact-shared.ts**
- **Found during:** Task 1
- **Issue:** The plan specified a single `contact-shared.ts` with both `handleContactList` and `handleContactDetails`. The details handler is 550 lines of complex XML processing logic, which would make a single file unwieldy (900+ lines).
- **Fix:** Split into `contact-shared.ts` (list) and `contact-details-shared.ts` (details) for maintainability. The `ContactType` type is exported from contact-shared.ts and imported by contact-details-shared.ts.

**2. [Rule 1 - Bug] Unified query schema limit max to 500**
- **Found during:** Task 1
- **Issue:** suppliers/route.ts had `limit.max(100)` while customers/route.ts had `limit.max(500)`. The shared schema needed a single value.
- **Fix:** Used max(500) (the more permissive value) to avoid breaking existing customer list pagination behavior.

## Verification Results

1. `npx tsc --noEmit` -- PASSED (zero errors)
2. `npm run build` -- PASSED (all 93 pages generated)
3. All 4 route files under 40 lines -- PASSED (22, 22, 26, 26)
4. contact-shared.ts contains list logic, contact-details-shared.ts contains details logic -- PASSED
5. grep confirms no duplicate function definitions in modals -- PASSED (EXIT:1)

## Known Stubs

None.

## Self-Check: PASSED
