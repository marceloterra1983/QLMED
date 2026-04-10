---
phase: 10-major-upgrades
plan: 04
subsystem: framework
tags: [next.js, react, upgrade, async-params, breaking-changes]
dependency_graph:
  requires: [10-01, 10-02, 10-03]
  provides: [next15, react19, async-request-apis]
  affects: [all-route-handlers, auth, middleware, page-components]
tech_stack:
  added: [next@15, react@19, react-dom@19, "@types/react@19", "@types/react-dom@19"]
  patterns: [async-params, async-headers, use-client-dynamic-ssr]
key_files:
  created: []
  modified:
    - package.json
    - next.config.mjs
    - tsconfig.json
    - src/lib/auth.ts
    - src/middleware.ts
    - src/app/api/invoices/[id]/route.ts
    - src/app/api/invoices/[id]/pdf/route.ts
    - src/app/api/invoices/[id]/download/route.ts
    - src/app/api/invoices/[id]/details/route.ts
    - src/app/api/invoices/bulk-download/route.ts
    - src/app/api/users/[id]/route.ts
    - src/app/api/estoque/entrada-nfe/[invoiceId]/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/installments/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/installments/route.ts
    - src/app/api/onedrive/connections/[id]/route.ts
    - src/app/api/onedrive/connections/[id]/files/route.ts
    - src/app/api/onedrive/connections/[id]/validate/route.ts
    - src/app/auth/callback/page.tsx
    - 20 page.tsx files (added 'use client')
decisions:
  - Next.js 15 with --legacy-peer-deps for next-auth compatibility
  - serverComponentsExternalPackages moved to top-level serverExternalPackages
  - 20 page.tsx wrappers converted to client components for ssr:false compatibility
  - req.ip removed from middleware (deprecated in Next.js 15)
metrics:
  duration: 460s
  completed: "2026-04-10T04:47:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 41
---

# Phase 10 Plan 04: Next.js 15 + React 19 Upgrade Summary

Next.js 14->15 and React 18->19 upgrade with full async request API migration across 15 route files, auth module, middleware, and 20 page components.

## What Was Done

### Task 1: Install Next.js 15 + React 19 and fix compilation

**Package upgrades:**
- `next` ^14.2.0 -> ^15.5.15
- `react` ^18.3.0 -> ^19.2.5
- `react-dom` ^18.3.0 -> ^19.2.5
- `@types/react` ^18.3.0 -> ^19 (already at 19 from prior wave)
- `@types/react-dom` ^18.3.0 -> ^19

**Breaking changes fixed:**

1. **Async params migration (15 route files, 20 handler functions):** Changed `{ params }: { params: { id: string } }` to `{ params }: { params: Promise<{ id: string }> }` with `const { id } = await params;` in every dynamic route handler.

2. **Async headers() in auth.ts:** `headers()` from `next/headers` now returns a Promise. Made `isValidApiKey()` async and added `await headers()`.

3. **req.ip removed from middleware:** `NextRequest.ip` was deprecated in Next.js 15. Removed fallback to `req.ip`, keeping `x-forwarded-for` and `x-real-ip` headers.

4. **serverComponentsExternalPackages -> serverExternalPackages:** Graduated from experimental in Next.js 15.

5. **ssr: false in Server Components:** Next.js 15 disallows `dynamic(() => ..., { ssr: false })` in Server Components. Added `'use client'` directive to 20 page.tsx wrapper files.

6. **searchParams async in page components:** `src/app/auth/callback/page.tsx` searchParams prop migrated to `Promise<...>` with await.

7. **Internal route call in bulk-download:** Wrapped params in `Promise.resolve()` for internal call to pdf route handler.

### Task 2: Verify Next.js 15 + React 19 end-to-end (auto-approved)

Auto-approved in auto-advance mode. Build and lint pass clean.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed 20 page.tsx files with ssr:false in Server Components**
- **Found during:** Task 1 (build step)
- **Issue:** Next.js 15 disallows `dynamic(() => ..., { ssr: false })` in Server Components
- **Fix:** Added `'use client'` directive to all 20 page.tsx wrapper files
- **Files modified:** 20 page.tsx files under src/app/(painel)/
- **Commit:** 9ff0def

**2. [Rule 3 - Blocking] Fixed bulk-download internal route call**
- **Found during:** Task 1 (tsc check)
- **Issue:** Internal call to pdf route passed plain params object, but handler now expects Promise
- **Fix:** Wrapped with `Promise.resolve({ id: invoice.id })`
- **File:** src/app/api/invoices/bulk-download/route.ts
- **Commit:** 9ff0def

**3. [Rule 3 - Blocking] Fixed req.ip deprecation in middleware**
- **Found during:** Task 1 (tsc check)
- **Issue:** `NextRequest.ip` removed in Next.js 15
- **Fix:** Removed `req.ip` fallback, already had `x-forwarded-for` and `x-real-ip`
- **File:** src/middleware.ts
- **Commit:** 9ff0def

**4. [Rule 2 - Missing] Fixed auth/callback searchParams async**
- **Found during:** Task 1 (discovered additional file not in plan)
- **Issue:** Page component used synchronous searchParams (Next.js 15 breaking change)
- **Fix:** Made searchParams type `Promise<...>` and added await
- **File:** src/app/auth/callback/page.tsx
- **Commit:** 9ff0def

**5. [Rule 2 - Missing] Two additional route files already migrated**
- **Found during:** Task 1 (grep scan)
- **Issue:** `ncm/[code]/route.ts` and `cnpj/[cnpj]/route.ts` also have dynamic params
- **Fix:** No fix needed - these were already using async params pattern from a prior change
- **Files:** Already correct

## Verification Results

- `next` version: ^15.5.15
- `react` version: ^19.2.5
- `await params` occurrences in API routes: 20
- `npm run build`: PASSED
- `npm run lint`: PASSED
- `npx tsc --noEmit`: PASSED (0 errors)

## Known Stubs

None - all changes are complete implementations.

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | 9ff0def | feat(10-04): upgrade Next.js 14->15 + React 18->19 with async params migration |

## Self-Check: PASSED

- SUMMARY.md exists: YES
- Commit 9ff0def exists: YES
- next@15 in package.json: YES
- react@19 in package.json: YES
