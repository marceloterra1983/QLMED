---
phase: 02-dependency-fixes
plan: 02
subsystem: dependencies
tags: [exceljs, xlsx, security, migration]
dependency_graph:
  requires: [02-01]
  provides: [xlsx-removed, exceljs-installed]
  affects: [estoque-import, product-import, produtos-page]
tech_stack:
  added: [exceljs]
  removed: [xlsx]
  patterns: [ExcelJS.Workbook, worksheet.eachRow, worksheet.getCell]
key_files:
  created: []
  modified:
    - package.json
    - package-lock.json
    - src/app/api/estoque/import-e509/route.ts
    - src/app/api/products/import-types/route.ts
    - src/app/(painel)/cadastro/produtos/page-client.tsx
decisions:
  - Pass ArrayBuffer directly to exceljs load() instead of Buffer.from() to avoid Node 22 generic Buffer type incompatibility
  - Keep cellStr/cellNum helper functions with 0-based interface, adding +1 internally for exceljs 1-based indexing
metrics:
  duration: 419s
  completed: "2026-04-10T01:54:13Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 5
requirements_completed: [DEP-04]
---

# Phase 02 Plan 02: Replace xlsx with exceljs Summary

Migrated all 4 xlsx usage locations to exceljs, eliminating abandonware dependency with known prototype pollution vulnerability (no upstream fix).

## One-liner

Replaced abandonware xlsx with actively-maintained exceljs across 2 server routes and 2 client-side import handlers, preserving all Excel read functionality.

## What Was Done

### Task 1: Replace xlsx with exceljs in server-side routes (df86909)

- Installed exceljs, uninstalled xlsx
- Rewrote `import-e509/route.ts`: static `import ExcelJS from 'exceljs'`, `ExcelJS.Workbook` + `getCell()` with 1-based indexing. Kept `cellStr`/`cellNum` helpers with 0-based interface (add +1 internally) so all call sites remain unchanged.
- Rewrote `import-types/route.ts`: dynamic `import('exceljs')`, `worksheet.eachRow()` to build `allRows: string[][]` array equivalent to `sheet_to_json(ws, { header: 1 })`.

### Task 2: Replace xlsx with exceljs in client-side code (ca9ba38)

- Rewrote `handleXlsImport` in `page-client.tsx`: dynamic import of exceljs, `eachRow` to build `rows: unknown[][]`.
- Rewrote ANVISA data import XLS branch: same pattern, building `allRows: string[][]`.
- Fixed Node 22 Buffer generic type incompatibility: pass `ArrayBuffer` directly to `workbook.xlsx.load()` instead of wrapping with `Buffer.from()`.
- Verified `npm run build` passes with zero errors.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Node 22 Buffer<ArrayBuffer> type incompatibility**
- **Found during:** Task 1 and Task 2
- **Issue:** Node 22 `Buffer.from()` returns `Buffer<ArrayBuffer>` which is not assignable to exceljs's `Buffer` type parameter. The `as unknown as Buffer` cast also failed in Next.js build.
- **Fix:** Pass `ArrayBuffer` directly to `workbook.xlsx.load()` -- exceljs accepts it at runtime despite types declaring `Buffer`.
- **Files modified:** All 3 source files
- **Commit:** ca9ba38

**2. [Rule 3 - Blocking] ESLint @typescript-eslint/no-explicit-any rule not configured**
- **Found during:** Task 2
- **Issue:** Initial approach used `eslint-disable-next-line @typescript-eslint/no-explicit-any` but the project doesn't have the `@typescript-eslint` ESLint plugin configured, causing build failure.
- **Fix:** Removed eslint-disable comments, used direct ArrayBuffer passing instead of `any` casts.
- **Commit:** ca9ba38

## Verification Results

- `grep -c "xlsx" package.json` = 0 (xlsx removed)
- `grep -c "exceljs" package.json` = 1 (exceljs added)
- `grep -rc "from 'xlsx'|import.*'xlsx'" src/` = 0 (no xlsx imports)
- `npm run build` = SUCCESS (exit 0)
- `npm audit` = 4 high vulnerabilities (down from 5 after xlsx removal)

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | df86909 | feat(02-02): replace xlsx with exceljs in server-side routes |
| 2 | ca9ba38 | feat(02-02): replace xlsx with exceljs in client-side code, verify build |

## Self-Check: PASSED
