---
phase: "03"
plan: "01"
subsystem: database
tags: [prisma, indexes, schema, shadow-tables]
dependency_graph:
  requires: []
  provides: [invoice-recipient-index, shadow-table-visibility]
  affects: [prisma/schema.prisma]
tech_stack:
  added: []
  patterns: [prisma-ignore-stubs]
key_files:
  modified: [prisma/schema.prisma]
decisions:
  - Used @@ignore pattern consistent with existing InvoiceTaxTotals/InvoiceItemTax/ContactFiscal/NcmCache stubs
  - Mapped all columns including aggregation fields and fiscal totals to ensure full schema visibility
metrics:
  duration: 182s
  completed: "2026-04-10"
---

# Phase 3 Plan 1: Database Schema Hardening Summary

**Add missing Invoice indexes and 6 shadow table model stubs to Prisma schema for query optimization and schema visibility**

## What Was Done

### Task 1: Invoice Indexes (DB-01)
Added two indexes to the Invoice model:
- `@@index([recipientCnpj])` -- standalone index for queries filtering by recipient CNPJ
- `@@index([companyId, recipientCnpj])` -- compound index for company-scoped recipient queries (customers page, CNPJ monitoring)

### Task 2: Shadow Table Stubs (DB-02)
Added `@@ignore` model stubs for 6 tables managed by raw SQL:

1. **ProductRegistry** (product_registry) -- 55+ columns including product data, ANVISA fields, fiscal settings, aggregation caches. Managed by `src/lib/product-registry-store.ts`.

2. **StockEntry** (stock_entry) -- Invoice entry tracking with fiscal totals (E509 pattern). Managed by `src/lib/stock-entry-store.ts`.

3. **NfeEntryItem** (nfe_entry_item) -- Per-item data for NF-e entries with lot tracking, fiscal details, and cost allocation. Managed by `src/lib/stock-entry-store.ts`.

4. **ProductSettingsCatalog** (product_settings_catalog) -- Hierarchical catalog entries for product settings (lines, groups, fiscal configs). Managed by `src/lib/product-settings-catalog.ts`.

5. **CnpjCache** (cnpj_cache) -- BrasilAPI CNPJ lookup cache with JSONB data. Managed by `src/lib/cnpj-lookup.ts`.

6. **CnpjMonitoring** (cnpj_monitoring) -- CNPJ status change tracking for contacts. Managed by `src/lib/cnpj-monitor.ts`.

## Verification

- `npx prisma validate` -- PASSED
- `npm run build` -- PASSED (all pages compile successfully)
- No `prisma db push` was executed (shared DB safety)

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all models are intentionally `@@ignore` stubs that mirror existing raw SQL tables.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1-2 | 486a7c3 | feat(03): add missing indexes and shadow table stubs to Prisma schema |

## Self-Check: PASSED
