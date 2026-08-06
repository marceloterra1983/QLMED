---
phase: 01-security-critical
plan: 03
subsystem: middleware, api-routes, auth
tags: [security, middleware, auth, password-policy]
dependency_graph:
  requires: [01-02]
  provides: [catch-all-api-auth, anvisa-auth, tiered-health, password-policy-alignment]
  affects: [all-api-routes, middleware]
tech_stack:
  added: []
  patterns: [public-route-allowlist, tiered-response]
key_files:
  created: []
  modified:
    - src/middleware.ts
    - src/app/api/anvisa/validate/route.ts
    - src/app/api/anvisa/embed-status/route.ts
    - src/app/api/health/route.ts
    - src/app/api/users/[id]/route.ts
    - src/lib/rate-limit.ts
decisions:
  - Array-based allowlist instead of Set for Edge Runtime compatibility
metrics:
  duration: 180s
  completed: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 6
requirements: [SEC-03, SEC-04, SEC-05, SEC-06]
---

# Phase 01 Plan 03: API Auth Coverage Summary

Catch-all middleware matcher with public allowlist, ANVISA auth guards, tiered health endpoint, and password policy alignment.

## What Was Done

### Task 1: Switch middleware matcher to catch-all with public allowlist
**Commit:** `7ee0be9`

Replaced the explicit per-route matcher list (18 individual route patterns) with a single `/api/:path*` catch-all. Added a `PUBLIC_API_ROUTES` array containing only `/api/auth`, `/api/register`, and `/api/health`. The `isPublicApiRoute()` function checks exact match or prefix match. Public route bypass runs AFTER rate limiting (preserving brute-force protection) but BEFORE API key/JWT checks.

Also added missing panel page routes to the matcher: `/estoque/:path*`, `/relatorios/:path*`, `/visaogeral/:path*`.

Previously unprotected API routes now require authentication: `/api/estoque`, `/api/fiscal`, `/api/reports`, `/api/contacts`, `/api/access-log`, `/api/cnpj`, `/api/cte`, `/api/ncm`.

### Task 2: Auth guards, tiered health, password fix
**Commit:** `77b68ab`

- **ANVISA validate** (`/api/anvisa/validate`): Added `requireAuth()` guard at top of GET handler before code parameter extraction.
- **ANVISA embed-status** (`/api/anvisa/embed-status`): Added `requireAuth()` guard at top of GET handler.
- **Health endpoint** (`/api/health`): Uses `getServerSession()` to check auth. Public response returns `status`, `db.status`, `db.latencyMs`, `build` (incl. commitSha), `timestamp`. Authenticated response adds `uptime`, `memory`, `integrity` (and outbox). Error responses also tiered (`build` only when authenticated on error paths).
- **Password policy** (`/api/users/[id]`): Changed Zod schema from `min(4)` to `min(6)`, aligning with the runtime check at line 95.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed Map iteration in rate-limit.ts for Edge Runtime**
- **Found during:** Task 2 (build verification)
- **Issue:** `for (const [key, entry] of store)` on a `Map` fails with TypeScript's target config (no `--downlevelIteration`). Pre-existing from Plan 01-02.
- **Fix:** Changed to `Array.from(store.entries())` iteration.
- **Files modified:** `src/lib/rate-limit.ts`
- **Commit:** `77b68ab`

**2. [Rule 3 - Blocking] Fixed Set iteration in middleware for Edge Runtime**
- **Found during:** Task 2 (build verification)
- **Issue:** `for (const route of PUBLIC_API_ROUTES)` on a `Set` fails with same TypeScript target config.
- **Fix:** Changed `PUBLIC_API_ROUTES` from `Set` to plain array with index-based loop.
- **Files modified:** `src/middleware.ts`
- **Commit:** `77b68ab`

## Verification Results

- Catch-all `/api/:path*` present in matcher: PASS
- `PUBLIC_API_ROUTES` allowlist present: PASS
- `isPublicApiRoute` function exists: PASS
- `requireAuth` in anvisa/validate: PASS
- `requireAuth` in anvisa/embed-status: PASS
- `getServerSession` in health route: PASS
- Zod `min(6)` in users/[id]: PASS
- No `min(4)` remaining: PASS
- `npm run build`: PASS

## Known Stubs

None - all implementations are complete with no placeholder data.

## Self-Check: PASSED

- All 6 modified files exist on disk
- Commit 7ee0be9 (Task 1) verified
- Commit 77b68ab (Task 2) verified
