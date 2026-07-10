---
phase: 04-xml-extraction-performance
plan: 01
subsystem: api-routes
tags: [performance, xml-elimination, sql-optimization]
dependency_graph:
  requires: [invoice_item_tax shadow table]
  provides: [xmlContent-free product counting in suppliers/customers]
  affects: [/api/suppliers, /api/customers]
tech_stack:
  added: []
  patterns: [raw SQL COUNT DISTINCT via invoice_item_tax join]
key_files:
  created: []
  modified:
    - src/app/api/suppliers/route.ts
    - src/app/api/customers/route.ts
decisions:
  - Use invoice_item_tax table (not product_registry) for both routes since it tracks per-invoice product data with join to Invoice for CNPJ filtering
metrics:
  duration: 140s
  completed: "2026-04-10T02:09:12Z"
---

# Phase 04 Plan 01: Eliminate xmlContent from Product Counting Summary

**One-liner:** Replaced xmlContent regex parsing with invoice_item_tax SQL joins for product counting in suppliers and customers routes

## What Was Done

### Task 1: Suppliers route product count via invoice_item_tax
- **Commit:** `c602584`
- Removed `prisma.invoice.findMany` that loaded full `xmlContent` for all paginated supplier invoices
- Removed regex parsing of `<det>` blocks to extract `cProd::xProd::uCom` keys
- Replaced with single `$queryRawUnsafe` SQL: `COUNT(DISTINCT CONCAT(product_code, product_name, product_unit))` from `invoice_item_tax` joined with `Invoice` on `senderCnpj`
- Added try/catch fallback for when `invoice_item_tax` table does not exist

### Task 2: Customers route product count via invoice_item_tax
- **Commit:** `ed49af8`
- Same pattern as suppliers but filtering on `direction = 'issued'` and `recipientCnpj`
- City extraction block (lines 149-173, PERF-01 scope) intentionally left unchanged
- Added try/catch fallback for missing table

## Performance Impact

Previously, these routes loaded **every xmlContent field** (50-200KB per invoice) for all invoices matching paginated CNPJs, then parsed each with regex. For a supplier with 500 invoices, that could mean loading 25-100MB of XML data just to count products.

Now: a single SQL query with GROUP BY handles the counting at the database level. No XML data leaves the database.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - both routes fully wired to invoice_item_tax table with graceful fallback.

## Verification Results

1. `grep xmlContent suppliers/route.ts` -- zero matches
2. `grep xmlContent customers/route.ts` -- only city extraction block (lines 152-165), not product counting
3. `grep invoice_item_tax` in both routes -- confirmed new query pattern present
4. TypeScript compiles without errors (pre-existing Next.js node_modules type warnings only)
5. `npm run build` -- compiled successfully, pages generated

## Self-Check: PASSED

- [x] `src/app/api/suppliers/route.ts` -- FOUND, modified
- [x] `src/app/api/customers/route.ts` -- FOUND, modified
- [x] Commit `c602584` -- FOUND
- [x] Commit `ed49af8` -- FOUND
