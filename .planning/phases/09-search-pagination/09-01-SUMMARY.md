---
phase: 09-search-pagination
plan: 01
subsystem: invoices-api
tags: [performance, search, database, pagination]
dependency_graph:
  requires: []
  provides: [db-level-search, invoice-search-pagination]
  affects: [invoices-api]
tech_stack:
  added: []
  patterns: [prisma-contains-insensitive, db-level-search, nickname-pre-lookup]
key_files:
  created: []
  modified:
    - src/app/api/invoices/route.ts
decisions:
  - Used Prisma `contains` with `mode: insensitive` (equivalent to ILIKE) instead of raw SQL
  - Pre-lookup ContactNickname CNPJs for DB-level nickname matching instead of post-fetch filtering
metrics:
  duration: 238s
  completed: "2026-04-10T04:13:16Z"
  tasks: 2
  files: 1
---

# Phase 09 Plan 01: DB-Level Invoice Search Summary

Replaced in-memory flexMatchAll (load 5000 records + JS filter) with Prisma WHERE contains/insensitive DB-level search with proper pagination.

## What Changed

### Task 1: Replace flexMatchAll with DB-level WHERE ILIKE
- **Removed** `take: 5000` pattern that loaded up to 5000 invoices into memory
- **Removed** `flexMatchAll` in-memory filtering across 10 fields
- **Added** dynamic Prisma WHERE clause with AND/OR logic:
  - Each search word creates an AND group
  - Each AND group has OR conditions across: senderName, recipientName, accessKey, number, senderCnpj, recipientCnpj
  - All conditions use `contains` with `mode: 'insensitive'` (Prisma's ILIKE equivalent)
- **Added** DB-level nickname pre-lookup: queries ContactNickname for matching shortNames, then includes matching CNPJs in OR conditions
- **Applied** standard `skip`/`take` pagination with parallel `count()` query for correct totals
- **Preserved** cfopTag pre-filter when combined with search

### Task 2: Verification
- TypeScript compiles with zero errors
- No `take: 5000` pattern in code
- No `flexMatchAll` reference in invoices route
- 7 `contains`/`insensitive` patterns confirm DB-level search

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 890dc73 | Replace in-memory flexMatchAll with DB-level WHERE ILIKE search |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED
