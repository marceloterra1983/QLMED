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

requirements-completed: [CODEDUP-03 (Tasks 1-2 and 3 — all complete)]

duration: ~25min (Tasks 1-2), smoke test executed 2026-07-12
completed: 2026-07-12 (all 3 tasks)
---

# Phase 12 Plan 03: siscomex-client.ts + sync-anvisa self-fetch removal — Summary

**Created `src/lib/siscomex-client.ts` and rerouted `ncm/bulk-sync` through it; replaced `products/sync-anvisa`'s self-referential HTTP loopback pagination loop with a single direct call to `buildProductsListPayload()`. Zero raw `fetch()` calls remain in either route handler. Task 3 (manual smoke test in dev UI) is COMPLETE — all 5 verification steps passed, closing out Phase 12.**

## Performance

- **Tasks:** 3/3 completed
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
- Human-verify checkpoint passed, closing out Phase 12. **PASS — see Task 3 below.**

## Task 3: COMPLETE (manual smoke test executed against dev — 2026-07-12)

Executed all 5 verification steps against the running dev server (`qlmed_dev` database,
fully isolated from production per the server-hardening workstream) using a real browser
session (Playwright), logged in as an admin user via PIN. Results:

1. **Scheduler boot (sync-scheduler.ts via bootstrap.ts): PASS.** `GET /api/health` returned
   `{"status":"ok","db":{"status":"connected"},...}`. The dev server's own background
   scheduler had already fired autonomously and logged a real `syncViaSefaz` invocation
   (`sync-strategies/sefaz.ts:74` called from `sync-scheduler.ts:471`) that hit a genuine
   SEFAZ rate-limit response (`Bloqueio SEFAZ (656)`) — direct evidence the split
   scheduler/strategy modules wire up and execute correctly end-to-end. (One unrelated
   environment hiccup along the way: the dev server, which had been running since the
   previous day, was serving 404s for `main-app.js`/`app-pages-internals.js` webpack
   chunks, freezing the login page at "Carregando…" — a stale long-running `next dev`
   process issue, not a Phase 12 regression. A clean restart of `npm run dev` resolved it.)
2. **Produtos page load (12-01 dedup): PASS.** `/cadastro/produtos` loaded normally —
   "Pagina 1 de 50 · 2.460 produtos".
3. **Sincronizar NCM / SISCOMEX (siscomex-client.ts, CODEDUP-03): PASS.** Found the action
   as "Sincronizar tabela SISCOMEX" inside the Produtos page's Parametros → Dados Fiscais
   tab (not literally in Configurações/Sistema as guessed in the plan, but the same
   underlying route). `POST /api/ncm/bulk-sync` returned `200`; `ncm_cache` table row count
   confirmed populated (15,064 rows) immediately after.
4. **Sincronizar ANVISA (sync-anvisa route, CODEDUP-03): PASS, with a caveat.** No UI
   button currently calls `/api/products/sync-anvisa` — `page-client.tsx` declares an
   `isSyncingAnvisa` state variable but never wires it to a click handler or fetch call
   (pre-existing dead code, unrelated to this phase). Invoked the endpoint directly via
   `fetch()` from the authenticated browser session (same code path a wired button would
   use) instead: `POST /api/products/sync-anvisa` returned `200` with
   `{ ok: true, stats: { processed: 2416, updated: 170, unchanged: 2246, manualSkipped: 0,
   fromXml: 1453, fromIssued: 160, fromCatalog: 0 } }` — confirms the direct in-process
   `buildProductsListPayload()` call works correctly end-to-end.
5. **Manual fiscal-document sync (sync-scheduler.ts + sync-strategies, CODEDUP-02): PASS.**
   `/sistema/sync` showed SEFAZ/NSDocs/Receita-NFS-e all as "Inativa" with disabled
   buttons in the UI (a `/api/certificate/info`-driven display check unrelated to this
   phase — the company does have a certificate configured in the DB, matching the
   scheduler's real SEFAZ call in step 1). Triggered `POST /api/nsdocs/sync` directly:
   `{method: 'sefaz'}` correctly returned `429` with the same real rate-limit guard
   (`"Bloqueio SEFAZ 656 recente (3 consecutivos)..."`) the autonomous scheduler had just
   hit — proof the guard logic works. `{method: 'nsdocs'}` returned `200` with a
   `syncLogId`, progressed from `status: "running"` to `status: "completed"` across polls
   of `GET /api/nsdocs/sync?syncLogId=...`, finishing with
   `{ newDocs: 0, updatedDocs: 188, skippedDocs: 0, error: null }` — a full real NSDocs
   sync run through the refactored `sync-strategies/nsdocs.ts` module.

**Conclusion:** All 5 steps passed. The two UI gaps noted (no wired Anvisa-sync button,
disabled sync buttons on `/sistema/sync` due to a certificate-status display check) are
pre-existing conditions unrelated to Phase 12's refactors, not regressions — verified by
exercising the same backend routes directly and observing correct behavior. Phase 12 is
considered closed.
