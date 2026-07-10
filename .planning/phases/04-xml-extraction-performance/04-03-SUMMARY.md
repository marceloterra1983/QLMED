---
phase: 04-xml-extraction-performance
plan: 03
subsystem: products-api
tags: [deprecation, performance, api-migration]
dependency_graph:
  requires: []
  provides: [legacy-products-deprecation]
  affects: [products-api, products-frontend]
tech_stack:
  added: []
  patterns: [deprecation-header, incremental-migration]
key_files:
  created: []
  modified:
    - src/app/api/products/route.ts
    - src/app/(painel)/cadastro/produtos/page-client.tsx
decisions:
  - Keep full CSV export on legacy route until /api/products/list supports all fields
  - Keep ANVISA missing export on legacy route (needs ean field)
  - Migrate auto-classify to /api/products/list (only needs anvisa field)
metrics:
  duration: 183s
  completed: "2026-04-10"
  tasks: 2
  files: 2
requirements: [PERF-04]
---

# Phase 04 Plan 03: Deprecate Legacy Products Route Summary

Legacy /api/products route marked with X-Deprecated header and console.warn; auto-classify ANVISA fetch migrated to /api/products/list which queries product_registry table instead of parsing XML.

## Tasks Completed

### Task 1: Add deprecation header to legacy products route
- **Commit:** aff2b91
- Added `console.warn('[DEPRECATED]...')` after auth check in GET handler
- Added `X-Deprecated: Use /api/products/list instead` header on all 3 response paths (empty products, success, error)
- Route remains functional for callers that still need XML-parsed data

### Task 2: Migrate frontend export calls to /api/products/list
- **Commit:** 63a7b1e
- **Migrated:** Auto-classify ANVISA bulk fetch (line ~1359) now uses `/api/products/list?sort=lastIssueDate&order=desc`
- **Kept on legacy with TODO:** Full CSV export (line ~976) -- requires ean, fiscal*, anvisa detail fields not in /list
- **Kept on legacy with TODO:** ANVISA missing export (line ~1025) -- requires ean field not in /list
- Sort param updated from `lastIssue` to `lastIssueDate` for /list route compatibility

## Deviations from Plan

### Partial Migration (Expected by Plan)

The plan anticipated that not all calls could be migrated. Two of three fetch calls remain on the legacy route because `/api/products/list` returns a lightweight product shape from `product_registry` that does not include:
- `ean` (EAN barcode)
- `fiscal*` fields (CEST, origem, CST ICMS, tributacao, ICMS/PIS/COFINS/IPI/FCP percentages)
- `anvisa*` detail fields (status, expiration, risk class, process, matched product name, holder, manufacturer country)
- `lastSalePrice`, `lastSaleDate`

These fields are only available via XML parsing in the legacy route. TODO comments document this for future resolution.

## Verification Results

1. Legacy route has X-Deprecated header: 3 occurrences confirmed
2. Auto-classify call points to /api/products/list: confirmed
3. Build passes with no TypeScript errors: confirmed
4. Remaining legacy calls have TODO comments: 2 calls documented

## Known Stubs

None -- all changes are functional.

## Self-Check: PASSED
