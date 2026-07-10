---
phase: 04-xml-extraction-performance
plan: 04
subsystem: customers-api
tags: [performance, xml-extraction, contact-fiscal, city]
dependency_graph:
  requires: [04-01]
  provides: [city-lookup-via-contact-fiscal]
  affects: [customers-route, contact-fiscal-store, parse-invoice-xml, product-aggregate-updater]
tech_stack:
  added: []
  patterns: [lazy-backfill, pre-extracted-lookup-table]
key_files:
  created: []
  modified:
    - src/lib/contact-fiscal-store.ts
    - src/app/api/customers/route.ts
    - src/lib/parse-invoice-xml.ts
    - src/lib/product-aggregate-updater.ts
decisions:
  - Lazy backfill (fire-and-forget on first request with missing cities) instead of blocking init
  - City stored as "xMun - UF" format matching existing UI expectations
  - City extraction added to PartyFiscalData for forward ingestion, not just backfill
metrics:
  duration: 238s
  completed: "2026-04-10T02:16:04Z"
  tasks: 2
  files: 4
requirements: [PERF-01]
---

# Phase 04 Plan 04: City Extraction from contact_fiscal Summary

Persisted city (xMun + UF) in contact_fiscal table, replacing runtime xmlContent parsing in customers route with a lightweight SQL lookup.

## What Was Done

### Task 1: Add city column to contact_fiscal table and update upsert
**Commit:** 05253e3

- Added `city TEXT` column via idempotent `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- Updated `ContactFiscalRow` and `ContactFiscalDbRow` interfaces with `city: string | null`
- Added `city` to the upsert INSERT/ON CONFLICT with COALESCE preservation
- Updated `mapRow` to include city in returned data

### Task 2: Replace xmlContent city extraction with contact_fiscal lookup + backfill
**Commit:** 2eddafa

- Removed the entire xmlContent loading block from customers/route.ts (DISTINCT ON query loading full XML + regex parsing)
- Added `getCityByCnpjs()` function for lightweight city lookup from contact_fiscal
- Added `backfillContactFiscalCity()` to populate city for existing contact_fiscal rows that have city IS NULL
- Extended `PartyFiscalData` interface with `city: string | null` and extracted `xMun` from XML during ingestion
- Updated `product-aggregate-updater.ts` to pass city through `upsertContactFiscal` during invoice processing
- Added lazy backfill trigger in customers route: fires backfill in background if any customers have missing cities

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Extended PartyFiscalData with city extraction**
- **Found during:** Task 2
- **Issue:** The plan only mentioned backfill and route changes, but the ingestion path (extractPartyFiscalData) also needed to extract city from XML to populate the field for new invoices going forward
- **Fix:** Added `city` field to `PartyFiscalData` interface in parse-invoice-xml.ts and extraction logic from `enderNode.xMun`
- **Files modified:** src/lib/parse-invoice-xml.ts, src/lib/product-aggregate-updater.ts
- **Commit:** 2eddafa

## Verification Results

1. `grep -c "xmlContent" src/app/api/customers/route.ts` = **0** (zero xmlContent references)
2. `grep -n "contact_fiscal" src/app/api/customers/route.ts` shows getCityByCnpjs and backfillContactFiscalCity imports
3. `grep -n "city" src/lib/contact-fiscal-store.ts` shows column, interface, upsert, getCityByCnpjs, backfill
4. `npm run build` succeeds with no errors

## Known Stubs

None - all data paths are fully wired.

## Self-Check: PASSED
