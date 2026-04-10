---
phase: 10-major-upgrades
plan: 02
subsystem: dependencies
tags: [upgrade, bcryptjs, zod, typescript]
dependency_graph:
  requires: []
  provides: [bcryptjs-v3, zod-v4, typescript-v6]
  affects: [schemas, auth, api-routes]
tech_stack:
  added: []
  patterns: [zod-v4-error-format, css-module-declarations]
key_files:
  created:
    - src/types/css.d.ts
  modified:
    - package.json
    - src/app/api/cte/manifest/route.ts
    - src/app/api/invoices/upload/route.ts
    - src/app/api/webhooks/n8n/route.ts
    - src/lib/schemas/estoque.ts
    - src/lib/schemas/invoice.ts
    - src/lib/schemas/product.ts
    - src/lib/schemas/receita.ts
decisions:
  - Removed @types/bcryptjs since bcryptjs v3 ships own TypeScript definitions
  - Upgraded to Zod 4 (not staying on v3) since breaking changes were manageable
  - Added css.d.ts for TypeScript 6 stricter CSS module resolution
metrics:
  duration: 338s
  completed: "2026-04-10T04:25:00Z"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 8
---

# Phase 10 Plan 02: Minor Dependency Upgrades Summary

Upgraded bcryptjs 2->3, zod 3->4, typescript 5->6 with all breaking changes resolved.

## What Was Done

### Task 1: Upgrade bcryptjs, zod, and typescript

**bcryptjs 2.4.3 -> 3.0.3:**
- Upgraded with `--legacy-peer-deps` (nodemailer peer conflict with next-auth)
- Removed `@types/bcryptjs` since v3 ships own TypeScript definitions
- API unchanged: `hash` and `compare` exports remain identical
- 3 files use bcryptjs (auth-options.ts, users/route.ts, users/[id]/route.ts) -- no code changes needed

**zod 3.23 -> 4.3.6:**
- Fixed 12 TypeScript errors across 7 files:
  - `errorMap: () => ({message})` replaced with `error: 'message'` (6 occurrences in schemas)
  - `z.record(valueType)` requires key type: changed to `z.record(z.string(), valueType)` (2 occurrences)
  - `required_error` replaced with `error` (2 occurrences in estoque.ts)
  - `.errors` property renamed to `.issues` on ZodError (1 occurrence in upload/route.ts)
- 25 files import zod; all compile cleanly after fixes

**typescript 5.5 -> 6.0.2:**
- TypeScript 6 introduced stricter CSS module checking
- Created `src/types/css.d.ts` to declare CSS module types
- No other breaking changes detected

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] CSS type declaration for TypeScript 6**
- **Found during:** Task 1 (TypeScript upgrade)
- **Issue:** TypeScript 6 raises TS2882 for `import './globals.css'` without type declaration
- **Fix:** Created `src/types/css.d.ts` with CSS module declaration
- **Files created:** src/types/css.d.ts
- **Commit:** 70db3e9

## Verification

- `npx tsc --noEmit` passes with zero errors
- `npm run build` passes cleanly
- bcryptjs: ^3.0.3, zod: ^4.3.6, typescript: ^6.0.2

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 70db3e9 | feat(10-02): upgrade bcryptjs 2->3, zod 3->4, typescript 5->6 |

## Known Stubs

None.

## Self-Check: PASSED

- All key files exist on disk
- Commit 70db3e9 verified in git log
