---
phase: 05-code-deduplication
plan: 01
subsystem: lib/utilities
tags: [deduplication, refactoring, code-quality]
dependency_graph:
  requires: []
  provides: [xml-helpers, cnpj-utils, centralized-utils]
  affects: [product-aggregation, ie-validation, invoice-duplicata-store]
tech_stack:
  added: []
  patterns: [canonical-module-pattern, import-from-single-source]
key_files:
  created:
    - src/lib/xml-helpers.ts
    - src/lib/cnpj-utils.ts
  modified:
    - src/lib/product-aggregation.ts
    - src/lib/invoice-duplicata-store.ts
    - src/lib/parse-invoice-tax.ts
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/app/api/invoices/[id]/details/route.ts
    - src/app/api/customers/details/route.ts
    - src/app/api/suppliers/details/route.ts
    - src/app/api/reports/valvulas-importadas/route.ts
    - src/app/api/products/sync-anvisa/route.ts
    - src/app/api/products/bulk-update/route.ts
    - src/app/api/products/anvisa/route.ts
    - src/app/api/products/route.ts
    - src/components/SupplierDetailsModal.tsx
    - src/components/CustomerDetailsModal.tsx
decisions:
  - Canonical val/num in xml-helpers use `any` param type for broader compatibility
  - details/route num() (string-returning) replaced with val() since behavior is identical
  - invoice-duplicata-store included as additional val/num dedup target (plan mentioned financeiro-duplicatas which had none)
metrics:
  duration: 496s
  completed: "2026-04-10T02:26:30Z"
  tasks: 2
  files: 16
---

# Phase 05 Plan 01: Centralize Duplicated Utility Functions Summary

Eliminated 20+ inline function duplicates across 13 files by centralizing 7 utility function groups into canonical modules with shared imports.

## What Was Done

### Task 1: Create new shared modules and export from existing ones
- Created `src/lib/xml-helpers.ts` with `val()`, `num()`, `gv()` XML accessor helpers
- Created `src/lib/cnpj-utils.ts` with `CnpjData` interface and `parseCnpjResponse()`
- Added `export` to `extractAnvisa` and `extractAnvisaFromFreeText` in `product-aggregation.ts`
- Verified `ensureArray`/`cleanString` in `utils.ts` and `validateIE` in `ie-validation.ts` already exported
- **Commit:** d3be962

### Task 2: Replace all inline duplicates with imports
- Removed 5 inline `ensureArray` copies (pdf/route, customers/details, suppliers/details, parse-invoice-tax, valvulas-importadas)
- Removed 6 inline `cleanString` copies (customers/details, suppliers/details, valvulas-importadas, sync-anvisa, bulk-update, anvisa)
- Removed 2 inline `extractAnvisa`/`extractAnvisaFromFreeText` copies (products/route, valvulas-importadas)
- Removed 2 inline `parseCnpjResponse` + `CnpjData` copies (SupplierDetailsModal, CustomerDetailsModal)
- Removed 2 inline `validateIEFormat` copies, replaced with `validateIE` from canonical module
- Removed 3 inline `val`/`num`/`gv` copies (invoice-duplicata-store, details/route, pdf/route)
- Net result: -404 lines removed, +99 lines added (imports + new modules)
- **Commit:** 89d649b

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] val/num/gv source was invoice-duplicata-store, not financeiro-duplicatas**
- **Found during:** Task 2
- **Issue:** Plan stated val/num/gv were in `financeiro-duplicatas.ts` lines 75-90, but they were actually in `invoice-duplicata-store.ts` lines 88-99. financeiro-duplicatas.ts had no such functions.
- **Fix:** Extracted from invoice-duplicata-store.ts instead, added it as an import consumer.
- **Files modified:** src/lib/invoice-duplicata-store.ts

**2. [Rule 1 - Bug] details/route num() returns string, not number**
- **Found during:** Task 2
- **Issue:** The `num()` function in invoices/[id]/details/route.ts returned `string` (not `number`), making it functionally identical to `val()`.
- **Fix:** Replaced all `num()` calls with `val()` in that file since behavior is identical for string output.
- **Files modified:** src/app/api/invoices/[id]/details/route.ts

## Verification Results

1. `npx tsc --noEmit` -- PASSED (zero errors)
2. Inline function grep -- PASSED (zero results outside canonical modules)
3. val/num/gv grep -- PASSED (only in src/lib/xml-helpers.ts)
4. `npm run build` -- PASSED (clean production build)

## Known Stubs

None.

## Self-Check: PASSED
