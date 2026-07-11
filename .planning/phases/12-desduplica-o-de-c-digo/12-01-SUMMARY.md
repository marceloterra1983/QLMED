# 12-01 SUMMARY — CODEDUP-01 (route.ts / product-aggregation.ts dedup)

**Status: BLOCKED — Task 1 done and passing, Task 2 reverted after discovering the
plan's target shape is not buildable, Task 3 not attempted.**

## What was executed

### Task 1 — Pre-refactor behavior snapshot (DONE, verified passing)

Created `src/lib/__tests__/products-route-dedup.test.ts`:
- Mocks `@/lib/auth` (`requireAuth` → `'user-1'`), `@/lib/single-company`
  (`getOrCreateSingleCompany` → `{ id: 'company-1' }`), `@/lib/product-registry-store`
  (`getProductRegistryByKeys` → `[]`), and `@/lib/prisma` (`invoice.findMany` backed by
  an in-memory fixture of 3 invoices, projected by `where`/`select`/`take` the same way
  the plan specified).
- Fixtures: (1) a received NF-e with two `<det>` items using units `UNID` and `CAIXA`
  (exercises `normalizeUnit`/`UNIT_ALIASES`), (2) an issued NF-e with CFOP `3102`
  (import entry, exercises Pass 2), (3) an issued NF-e to `NAVIX DISTRIBUIDORA
  HOSPITALAR LTDA` reselling the same code+unit as fixture 1's first item (exercises
  Pass 3 deduction).
- Calls `GET` from `@/app/api/products/route` with
  `?limit=50&sort=lastIssue&order=desc`, asserts `response.status === 200` and
  `payload` via `toMatchSnapshot()`.

Result: **passes**. The generated snapshot
(`src/lib/__tests__/__snapshots__/products-route-dedup.test.ts.snap`) confirms
`UNIT_ALIASES`/`buildProductKey` collapse `CAIXA`→`CX` and `UNID`→`UN` for keying
purposes (while preserving the raw unit string in the displayed `unit` field), and
that Pass 3 correctly deducted the resale quantity (PROD-001: `10 - 3 = 7`).

Acceptance criteria for Task 1: **both met**
- `npx vitest run src/lib/__tests__/products-route-dedup.test.ts` exits 0. ✅
- `.snap` file exists. ✅

### Task 2 — Remove duplicated helpers, extract `buildProductsListPayload` (ATTEMPTED, REVERTED)

Implemented exactly as specified: deleted the inline `ProductFromXml`,
`UNIT_ALIASES`, `normalizeUnit`, `buildProductKey`, `extractProductsFromXml` from
`route.ts`; imported them from `@/lib/product-aggregation`; renamed the local
`AggregatedProduct` to `RouteAggregatedProduct`; extracted the `GET()` body into
`export async function buildProductsListPayload(companyId, params)` with a new
`export interface ProductsListQueryParams`, per the plan.

**This is where the plan breaks: Next.js 15.5.19's App Router route-file type
validation rejects any named export from a `route.ts` file other than the
recognized HTTP handlers (`GET`/`POST`/etc.) and route-segment-config fields.**

`npm run build` fails with:
```
Type error: Route "src/app/api/products/route.ts" does not match the required types of a Next.js Route.
  "buildProductsListPayload" is not a valid Route export field.
```

This is not a bug I introduced — it's a hard, version-enforced constraint on what a
`route.ts` file is allowed to export, discovered only by actually running
`npm run build` (the plan's own Task 2 acceptance criterion). The plan's
`must_haves.artifacts` explicitly requires `buildProductsListPayload` to live in
`src/app/api/products/route.ts` ("exposes buildProductsListPayload() for reuse"),
and 12-03 is stated to depend on importing it from that exact path
(`@/app/api/products/route`). That requirement is incompatible with Next's route
export rules as currently written — fixing it means an architecture decision
(e.g., moving `buildProductsListPayload`/`ProductsListQueryParams` into a plain
`src/lib/*.ts` module and having `route.ts`'s `GET` import + call it there, then
updating 12-03's planned import path to match), not a "no-op" refactor tweak.

Per the run instructions for this session ("se algo falhar de um jeito que o plano
não previu, PARE — não improvise uma correção arriscada em código de produção
fiscal"), I did not unilaterally redesign the module boundary. I reverted
`src/app/api/products/route.ts` to its pre-Task-2 (HEAD) content via
`git checkout -- src/app/api/products/route.ts` and re-verified:
- `npm run build` exits 0 again (confirmed).
- The Task 1 snapshot test still passes against the untouched original file
  (confirmed).

A secondary, smaller defect was also found and would need fixing regardless of the
above: `UNIT_ALIASES` in `src/lib/product-aggregation.ts` (around line 254) is
declared as `const UNIT_ALIASES = ...` **without** `export`, even though the plan's
`<interfaces>` section asserts it's "already exported" and the `must_haves.key_links`
requires `route.ts` to import it. This alone is a trivial one-word fix
(`const` → `export const`), but it only matters once the Next.js route-export
problem above is resolved.

### Task 3 — Not attempted (depends on Task 2).

## Acceptance criteria — final status

- Task 1 (`vitest run ... exits 0`, `.snap` file exists): **PASS**
- Task 2 (5 grep checks + `npm run build` exits 0): **FAIL** — the code-shape checks
  (UNIT_ALIASES/normalizeUnit/etc. removed, RouteAggregatedProduct present,
  buildProductsListPayload exported) were all achievable, but `npm run build`
  cannot pass with `buildProductsListPayload`/`ProductsListQueryParams` exported
  from `route.ts` under Next.js 15.5.19's route-export validation. Reverted rather
  than shipped in a broken state.
- Task 3 (snapshot match + build + lint post-refactor): **NOT RUN** (blocked on
  Task 2).
- Overall phase `<success_criteria>`: not met — no behavior change was shipped
  (good, no regression risk), but the dedup itself did not land.

## Deviation from plan / recommendation for re-planning

The plan needs a small revision before re-attempting Task 2:
1. Move `buildProductsListPayload` + `ProductsListQueryParams` out of
   `src/app/api/products/route.ts` into a plain lib module (suggest
   `src/lib/products-list-payload.ts`, colocated with `product-aggregation.ts`
   since it consumes it directly). `route.ts`'s `GET` becomes a true thin wrapper:
   parse `searchParams`, resolve `company`, call the lib function, wrap in
   `NextResponse.json` + the `X-Deprecated` header.
2. Update 12-03's plan (currently expected to import `buildProductsListPayload`
   from `@/app/api/products/route`) to import from the new lib path instead.
3. Add `export` to `UNIT_ALIASES` in `src/lib/product-aggregation.ts` (currently
   module-private) so `normalizeUnit`/`buildProductKey`/`extractProductsFromXml`
   plus `UNIT_ALIASES` can all be imported as the plan's `key_links` pattern
   requires.

The Task 1 snapshot test (`src/lib/__tests__/products-route-dedup.test.ts` +
its `.snap` baseline) remains valid and reusable for whichever plan revision
follows — it doesn't depend on where `buildProductsListPayload` ends up living,
only on `GET`'s HTTP-visible behavior.

## Environment note (not the root cause, but worth flagging)

While investigating an earlier confusing intermediate state of `route.ts`
(a `ReferenceError: companyId is not defined` from my own incomplete edit, not
an external actor), I confirmed there is a separate, concurrently-running
`codex --dangerously-bypass-approvals-and-sandbox` agent process operating in
this exact same working directory (`/home/marce/qlmed/app-dev`), which had
independently modified/reverted unrelated files (`src/app/api/nsdocs/sync/route.ts`,
`src/lib/bootstrap.ts`, `src/lib/auto-sync.ts`, `src/lib/sync-scheduler.ts`) during
this session, outside of anything I touched. It did not touch
`src/app/api/products/route.ts` and is not the cause of the Task 2 blocker (that
is a genuine, reproducible Next.js build-time constraint, confirmed independently
via `npm run build`), but running two autonomous agents against the same
production-fiscal working tree at once is a real risk (uncoordinated commits,
races on the same files) worth the user's attention.

## Files touched

- `src/lib/__tests__/products-route-dedup.test.ts` — new, passing, kept.
- `src/lib/__tests__/__snapshots__/products-route-dedup.test.ts.snap` — new, kept.
- `src/app/api/products/route.ts` — edited then reverted via
  `git checkout --`; working tree matches HEAD, `npm run build` verified green.

## Commit

Committed only the safe, inert Task 1 artifacts (new test + its snapshot). No
changes to `route.ts` or `product-aggregation.ts` were committed since Task 2/3
did not complete successfully.
