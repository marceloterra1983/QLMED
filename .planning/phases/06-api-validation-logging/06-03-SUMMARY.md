---
phase: 06-api-validation-logging
plan: 03
subsystem: api-error-handling
tags: [error-handling, logging, catch-blocks, console-replacement, pino]
dependency_graph:
  requires: [06-01]
  provides: [standardized-error-handling, structured-logging-api]
  affects: [all-api-routes]
tech_stack:
  added: []
  patterns: [apiError-helper, createLogger-per-route, catch-unknown-narrowing]
key_files:
  modified:
    - src/app/api/invoices/upload/route.ts
    - src/app/api/invoices/route.ts
    - src/app/api/invoices/[id]/route.ts
    - src/app/api/invoices/[id]/details/route.ts
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/app/api/invoices/[id]/download/route.ts
    - src/app/api/invoices/backfill-tax/route.ts
    - src/app/api/invoices/bulk-download/route.ts
    - src/app/api/users/route.ts
    - src/app/api/users/[id]/route.ts
    - src/app/api/users/pending-count/route.ts
    - src/app/api/products/bulk-update/route.ts
    - src/app/api/products/route.ts
    - src/app/api/products/settings/route.ts
    - src/app/api/products/auto-classify/route.ts
    - src/app/api/products/sync-anvisa/route.ts
    - src/app/api/products/anvisa/route.ts
    - src/app/api/products/anvisa/bulk-import/route.ts
    - src/app/api/products/rename-manufacturer/route.ts
    - src/app/api/products/rename-type/route.ts
    - src/app/api/products/rename-fiscal/route.ts
    - src/app/api/nsdocs/sync/route.ts
    - src/app/api/nsdocs/config/route.ts
    - src/app/api/nsdocs/import-period/route.ts
    - src/app/api/nsdocs/documents/route.ts
    - src/app/api/certificate/upload/route.ts
    - src/app/api/certificate/info/route.ts
    - src/app/api/estoque/entrada-nfe/route.ts
    - src/app/api/estoque/entrada-nfe/[invoiceId]/route.ts
    - src/app/api/estoque/import-e509/route.ts
    - src/app/api/financeiro/contas-pagar/override/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/installments/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/installments/route.ts
    - src/app/api/onedrive/auth-url/route.ts
    - src/app/api/onedrive/connections/[id]/route.ts
    - src/app/api/onedrive/connections/[id]/validate/route.ts
    - src/app/api/onedrive/connections/route.ts
    - src/app/api/receita/nfse/config/route.ts
    - src/app/api/companies/route.ts
    - src/app/api/dashboard/route.ts
    - src/app/api/customers/route.ts
    - src/app/api/customers/details/route.ts
    - src/app/api/suppliers/route.ts
    - src/app/api/suppliers/details/route.ts
    - src/app/api/contacts/cnpj-status/route.ts
    - src/app/api/cnpj/[cnpj]/route.ts
    - src/app/api/cte/manifest/route.ts
    - src/app/api/fiscal/by-cfop/route.ts
    - src/app/api/fiscal/dashboard/route.ts
    - src/app/api/ncm/bulk-sync/route.ts
    - src/app/api/ncm/[code]/route.ts
    - src/app/api/ncm/refresh/route.ts
    - src/app/api/anvisa/validate/route.ts
    - src/app/api/anvisa/embed-status/route.ts
    - src/app/api/webhooks/n8n/route.ts
    - src/app/api/reports/valvulas-importadas/route.ts
    - src/app/api/reports/valvulas-importadas/pdf/route.ts
    - src/app/api/products/details/route.ts
    - src/app/api/products/list/route.ts
    - src/app/api/products/history/route.ts
    - src/app/api/products/import-types/route.ts
    - src/app/api/products/rebuild-aggregates/route.ts
    - src/middleware.ts
    - src/app/error.tsx
    - src/app/global-error.tsx
    - src/app/(painel)/error.tsx
    - src/components/LotEditModal.tsx
decisions:
  - "All catch(: any) converted to catch(: unknown) with instanceof narrowing for type safety"
  - "Client-side error boundaries and Edge Runtime middleware keep console.* with intentional marker comments"
  - "Prisma error code checks use typeof narrowing instead of optional chaining on unknown"
metrics:
  duration: 1038s
  completed: "2026-04-10T02:59:25Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 67
---

# Phase 06 Plan 03: Fix Catch Blocks and Console Calls Summary

All 34+ catch(: any) blocks converted to catch(: unknown) with proper type narrowing, and 86+ console.log/warn/error calls replaced with structured pino logger across 62 API route files plus middleware, error boundaries, and client components.

## What Was Done

### Task 1: Fix catch blocks and replace console calls in API routes (62 files)

**catch block fixes (34 occurrences across 27+ files):**
- Every `catch (e: any)`, `catch (err: any)`, and `catch (error: any)` converted to `catch (e: unknown)` (or `err`/`error`)
- Auth catch blocks narrowed with `if (e instanceof Error && e.message === 'FORBIDDEN')`
- Prisma P2002 checks narrowed with `typeof err === 'object' && 'code' in err`
- Outer catch blocks converted from manual `NextResponse.json({ error: '...' }, { status: 500 })` to `apiError(e, 'context')`

**console replacement (86 occurrences across 56 files):**
- Added `import { createLogger } from '@/lib/logger'` with route-specific logger names
- `console.log` replaced with `log.info`, `console.warn` with `log.warn`, `console.error` with `log.error`
- All structured data uses pino object-first pattern: `log.error({ err, context }, 'message')`
- Template literal messages converted to structured objects with named fields

### Task 2: Handle middleware, error boundaries, and client components (5 files)

- **middleware.ts**: Edge Runtime limitation -- console.warn kept with `// console.warn intentional` marker
- **error.tsx, global-error.tsx, (painel)/error.tsx**: Client-side error boundaries -- console.error kept with `// console.error intentional` marker
- **LotEditModal.tsx**: Client-side fetch error logging -- console.error kept with `// console.error intentional` marker

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing functionality] Additional files not in original plan list**
- **Found during:** Task 1
- **Issue:** Several API route files (rename-manufacturer, rename-type, rename-fiscal, anvisa/embed-status, onedrive/connections/route.ts, invoices/[id]/download/route.ts) had catch(: any) or manual error responses but were not in the plan's files_modified list
- **Fix:** Included them in the same transformation pass
- **Files modified:** 6 additional route files

**2. [Rule 1 - Bug] Unsafe property access on unknown type**
- **Found during:** Task 1
- **Issue:** After converting catch(e: any) to catch(e: unknown), several files still accessed e.message, e.code, err.name without proper type narrowing, which would cause TypeScript errors
- **Fix:** Added `instanceof Error` checks, `typeof` narrowing for Prisma error codes, and ternary operators for error message extraction
- **Files modified:** products/bulk-update, receita/nfse/config, ncm/bulk-sync, products/settings, ncm/refresh, anvisa/embed-status, cte/manifest, rename-fiscal, rename-manufacturer, rename-type

**3. [Rule 2 - Missing functionality] Outer catch blocks not using apiError()**
- **Found during:** Task 1
- **Issue:** Many routes had outer `catch (error) { return NextResponse.json({ error: 'Erro interno' }, { status: 500 }) }` which is functionally correct but doesn't use the apiError() helper for consistent logging
- **Fix:** Converted all outer catch blocks to use `return apiError(error, 'route-context')` for uniform error handling and logging
- **Files modified:** 40 additional route files

## Verification Results

- `grep -rn "catch\s*(\w*:\s*any)" src/app/api --include="*.ts"` returns **0 results**
- `grep -rn "console\.\(log\|warn\|error\)" src/app/api --include="*.ts"` returns **0 results**
- `grep -rn "console\.\(log\|warn\|error\)" src --include="*.ts" --include="*.tsx" | grep -v intentional | grep -v node_modules | grep -v src/lib/` returns **0 results**
- `npm run build` passes with exit code 0

## Known Stubs

None -- all changes are complete replacements, no placeholder code.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | f95a5a3 | feat(06-03): fix all catch(: any) blocks and replace console calls in 62 API routes |
| 2 | a42199e | feat(06-03): annotate intentional console calls in middleware, error boundaries, and client components |
