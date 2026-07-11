---
phase: 12-desduplica-o-de-c-digo
plan: 03
subsystem: ncm-anvisa-sync
tags: [siscomex, anvisa, fetch-extraction, dedup]

requires: ["12-01 (buildProductsListPayload in src/lib/product-aggregation.ts)"]
provides:
  - "src/lib/siscomex-client.ts — fetchSiscomexNomenclature(), SiscomexApiError, SiscomexTimeoutError"
affects: [ncm/bulk-sync route, products/sync-anvisa route]

tech-stack:
  added: []
  patterns: ["Dedicated external-integration client module (matches sefaz-client.ts/nsdocs-client.ts shape)"]

key-files:
  created:
    - src/lib/siscomex-client.ts
  modified:
    - src/app/api/ncm/bulk-sync/route.ts
    - src/app/api/products/sync-anvisa/route.ts

key-decisions:
  - "fetchSiscomexNomenclature() throws typed errors (SiscomexApiError with .status, SiscomexTimeoutError) instead of returning NextResponse — the route catches them and reproduces the exact same 502/504 status codes and JSON error bodies it returned inline before."
  - "sync-anvisa's self-fetch loop replaced with a single buildProductsListPayload(company.id, { ...exportAll: true }) call using the exact same query values the old loop passed (sort=quantity, order=desc, issuedNfeLookup=1→useIssuedNfeLookup:true, anvisaLookup=1→useAnvisaLookup:true) — exportAll:true returns all matching products in one call instead of paginating."
  - "Widened the route-local SyncProductItem.anvisaMatchMethod union to include 'manual' (previously only 'xml'|'issued_nfe'|'catalog_code_exact'|'catalog_name'|null) — the direct in-process call now carries strict types from buildProductsListPayload's return shape, which legitimately includes 'manual' as a value; the prior HTTP+JSON round-trip silently erased this type distinction. No behavior change: the loop's branch logic already only special-cased 'xml'/'issued_nfe'/'catalog_*' and left 'manual' unmatched, same as before."

patterns-established:
  - "External HTTP calls in route handlers must go through a named client module (siscomex-client.ts joins sefaz-client.ts/nsdocs-client.ts); internal loopback HTTP calls between our own routes become direct function calls instead."

requirements-completed: [CODEDUP-03 (Tasks 1-2 only — Task 3 pending, see below)]

duration: ~25min
completed: 2026-07-11 (Tasks 1-2 only)
---

# Phase 12 Plan 03: siscomex-client.ts + sync-anvisa self-fetch removal — Summary

**Created `src/lib/siscomex-client.ts` and rerouted `ncm/bulk-sync` through it; replaced `products/sync-anvisa`'s self-referential HTTP loopback pagination loop with a single direct call to `buildProductsListPayload()`. Zero raw `fetch()` calls remain in either route handler. Task 3 (manual smoke test in dev UI) is PENDING — see "Task 3: Pending" section below.**

## Performance

- **Tasks:** 2/3 completed (Task 3 is a human-verify checkpoint, intentionally not attempted by the automated executor — see note in Task 3 below)
- **Files created:** 1 (`src/lib/siscomex-client.ts`)
- **Files modified:** 2 (`src/app/api/ncm/bulk-sync/route.ts`, `src/app/api/products/sync-anvisa/route.ts`)

## Accomplishments

- `src/lib/siscomex-client.ts` created, exporting `fetchSiscomexNomenclature()`, `SiscomexApiError`, `SiscomexTimeoutError`, and `SiscomexItem` — following the same shape as `sefaz-client.ts`/`nsdocs-client.ts` (typed interfaces, custom error classes, 60s `AbortController` timeout).
- `ncm/bulk-sync/route.ts` no longer performs a raw `fetch(SISCOMEX_URL)` inline — it calls `fetchSiscomexNomenclature()` and catches `SiscomexApiError`/`SiscomexTimeoutError`/generic format `Error` to reproduce the exact same `502`/`504` status codes and JSON error bodies as before.
- `products/sync-anvisa/route.ts`'s `origin`/`cookieHeader`/`while (page <= totalPages) { fetch(...) }` self-referential loopback loop against its own `/api/products` endpoint is gone — replaced by one call to `buildProductsListPayload(company.id, { ...exportAll: true, sort: 'quantity', order: 'desc', useAnvisaLookup: true, useIssuedNfeLookup: true, ... })`, reading `payload.products` directly.
- `npm run build` and `npm run lint` both exit 0 on the full repo after both tasks.

## Task Commits

Tasks 1 and 2 were committed together (both touch the same close, cohesive refactor — extracting the SISCOMEX fetch and removing the internal loopback — and both were required for a clean, buildable state):

1. **Task 1 + Task 2: siscomex-client.ts + reroute ncm/bulk-sync; sync-anvisa direct call to buildProductsListPayload** — see commit created at the end of this plan (CODEDUP-03, partial — Tasks 1-2 only).

## Files Created/Modified

- `src/lib/siscomex-client.ts` — new: `fetchSiscomexNomenclature()`, `SiscomexApiError`, `SiscomexTimeoutError`, `SiscomexItem`
- `src/app/api/ncm/bulk-sync/route.ts` — inline `fetch(SISCOMEX_URL)` + AbortController + error branches removed; now imports and calls `fetchSiscomexNomenclature()` from `@/lib/siscomex-client`, catching its typed errors to preserve the exact `502`/`504` response shapes. NCM hierarchy-building / batch-insert logic below the fetch is unchanged.
- `src/app/api/products/sync-anvisa/route.ts` — `origin`/`cookieHeader`/pagination-loop `fetch()` block removed; replaced with `import { buildProductsListPayload, type ProductsListQueryParams } from '@/lib/product-aggregation'` and a single `buildProductsListPayload(company.id, queryParams)` call with `exportAll: true`. Local `SyncProductItem.anvisaMatchMethod` type widened to include `'manual'` (see key-decisions) to satisfy the stricter typing now that this is a direct in-process call instead of an untyped `await response.json()`.

## Deviations from Plan

- **TypeScript build error requiring a type-widening fix not explicitly spelled out in the plan's `<action>`:** After wiring `buildProductsListPayload()` directly (Task 2), `npm run build` failed with a type error: the payload's `products[].anvisaMatchMethod` includes `'manual'` as a possible value (assigned deep in `product-aggregation.ts`'s registry-merge logic), but the route-local `SyncProductItem` interface's union only listed `'xml' | 'issued_nfe' | 'catalog_code_exact' | 'catalog_name' | null`. This mismatch was invisible before because the old code went through an untyped `await response.json()` HTTP round-trip (implicit `any`), silently erasing the type. Fixed by widening the union to include `'manual'` — a type-only change with no behavior impact, since the existing loop logic already treated `'manual'` as an unmatched case (no `fromXml`/`fromIssued`/`fromCatalog` counter increments), identical to its prior behavior. This was the only deviation; everything else in Tasks 1-2 followed the plan's `<action>` verbatim.

## Acceptance Criteria Results

**Task 1:**
- `test -f src/lib/siscomex-client.ts && echo OK` → **PASS** (`OK`)
- `grep -c "export async function fetchSiscomexNomenclature" src/lib/siscomex-client.ts` → **PASS** (`1`)
- `grep -c "fetch(SISCOMEX_URL" src/app/api/ncm/bulk-sync/route.ts` → **PASS** (`0`)
- `grep -c "from '@/lib/siscomex-client'" src/app/api/ncm/bulk-sync/route.ts` → **PASS** (`1`)
- `npm run build` → **PASS** (exit 0)

**Task 2:**
- `grep -c "await fetch(url.toString()" src/app/api/products/sync-anvisa/route.ts` → **PASS** (`0`)
- `grep -c "buildProductsListPayload" src/app/api/products/sync-anvisa/route.ts` → **PASS** (`2`, ≥1 required)
- `grep -c "cookieHeader" src/app/api/products/sync-anvisa/route.ts` → **PASS** (`0`)
- `npm run build` → **PASS** (exit 0)
- `npm run lint` → **PASS** (exit 0)

## Success Criteria (from plan)

- `siscomex-client.ts` exists and `ncm/bulk-sync` uses it exclusively for the SISCOMEX HTTP call. **PASS**
- `products/sync-anvisa` no longer performs any raw `fetch()` call — it calls `buildProductsListPayload()` directly. **PASS**
- Both routes' response shapes/status codes are unchanged from before this plan. **PASS** (verified by code inspection: identical error status codes/bodies for ncm/bulk-sync; identical `{ ok, stats: {...} }` response shape for sync-anvisa, since only the products data-fetching mechanism changed, not the aggregation/registry-merge logic that builds the response)
- Human-verify checkpoint passed, closing out Phase 12. **PENDING — see Task 3 below.**

## Task 3: PENDING (manual smoke test — NOT performed by this executor)

Task 3 is a `checkpoint:human-verify` gate that requires triggering real actions against
external integrations of a production fiscal system (SISCOMEX NCM sync, ANVISA product
sync, and a SEFAZ/NSDocs/Receita-NFS-e manual sync) from the dev server's UI while logged
in. Per explicit instruction, this was **not simulated or executed by the automated
executor** — it requires the real developer to run it manually.

**Next step for the developer:**

1. Start the dev server: `qldev` (or `PORT=3001 npm run dev` from `~/qlmed/app-dev/`).
2. Check the startup log for `"Scheduler iniciado - verificando a cada 60s"` (proves
   `sync-scheduler.ts`'s `startAutoSync` still boots correctly — unrelated to this plan
   but part of the combined Phase 12 checkpoint).
3. Log into `http://localhost:3001` (or the Tailscale dev URL), open the Produtos page —
   confirm the product list still loads normally.
4. From Configurações/Sistema (or wherever the NCM sync action lives), trigger
   "Sincronizar NCM" (`POST /api/ncm/bulk-sync`) — confirm it returns
   `{ ok: true, total, inserted, updated }` and `ncm_cache` row count changes as expected.
5. Trigger "Sincronizar ANVISA" on the Produtos page (`POST /api/products/sync-anvisa`) —
   confirm it completes without error and the returned `stats`
   (processed/updated/unchanged/manualSkipped) look reasonable vs. a pre-Phase-12 run.
6. Trigger a manual sync (`POST /api/nsdocs/sync`, whichever method the test company uses)
   from the UI — confirm it starts and `GET /api/nsdocs/sync?syncLogId=...` reports
   progress/completion as before.
7. Reply "approved" (or describe any issues found) to close out Phase 12.

`npm run build` and `npm run lint` passing on the full repo (both confirmed above) already
give strong confidence the refactor is structurally sound; the manual smoke test's purpose
is to confirm actual runtime behavior against the real external integrations (SISCOMEX,
ANVISA-backed registry data, SEFAZ/NSDocs/Receita-NFS-e) which cannot be safely exercised
without a human at the controls of a real fiscal system.
