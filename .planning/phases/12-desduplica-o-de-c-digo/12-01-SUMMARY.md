# 12-01 SUMMARY — CODEDUP-01 (route.ts / product-aggregation.ts dedup)

**Status: DONE — second attempt, after the plan was corrected to fix the
Next.js 15 route-export build failure hit by the first attempt (see git
history / prior version of this file for that attempt's diagnosis).**

## Context: why this is attempt #2

The first execution of this plan hit a real, reproducible build error:
Next.js 15.5.19's App Router route-file type validation rejects any named
export from a `route.ts` file other than the recognized HTTP handlers
(`GET`/`POST`/etc.) and route-segment-config fields. `buildProductsListPayload`
cannot live in `route.ts`. The plan was corrected (see the "CORREÇÃO
PÓS-EXECUÇÃO" note right after the frontmatter in `12-01-PLAN.md`) to place
`buildProductsListPayload`/`ProductsListQueryParams` in
`src/lib/product-aggregation.ts` instead. That first attempt reverted
`route.ts` back to its original (duplicated) state via `git checkout --`,
keeping only Task 1's test + snapshot (commit `728ba1e`). This execution
starts from that reverted state and completes Task 2 and Task 3 against the
corrected plan.

Pre-flight checks confirmed before starting:
- `UNIT_ALIASES` in `src/lib/product-aggregation.ts` already had `export`
  added (trivial fix from the prior attempt) — verified via grep, not redone.
- `src/app/api/products/route.ts` was confirmed back in its original
  (duplicated) state.
- Task 1's test (`src/lib/__tests__/products-route-dedup.test.ts`) was
  re-run against the original `route.ts` first and passed, confirming the
  pre-refactor baseline snapshot is still valid before touching any
  production code.

## Task 2 — Remove duplicated helpers, extract `buildProductsListPayload` into `product-aggregation.ts`

Implemented as the corrected plan describes:

- Deleted from `route.ts`: `interface ProductFromXml`, `UNIT_ALIASES`,
  `function normalizeUnit`, `function buildProductKey`,
  `async function extractProductsFromXml`.
- `route.ts` now imports `buildProductsListPayload` (value) and
  `ProductsListQueryParams` (type) from `@/lib/product-aggregation` — two
  separate import statements, satisfying the "value import + type import"
  requirement.
- `buildProductsListPayload(companyId, params)` is defined in
  `src/lib/product-aggregation.ts`, appended at the end of the file. It
  contains the full extracted GET body (dateFilter construction, the
  3-pass aggregation — received invoices / import-CFOP entries / resale
  deduction — ANVISA enrichment via issued-NFe lookup and via
  `resolveAnvisaByCodeAndName`, product-registry merge, search/filter,
  sort, pagination, summary/anvisaStats), copied verbatim (no logic
  changes) from the former `GET()` handler.
- `route.ts`'s `GET()` is now a thin orchestrator: auth check, `log.warn`
  deprecation notice, `getOrCreateSingleCompany`, parse `searchParams` into
  a `ProductsListQueryParams` object, call `buildProductsListPayload`, wrap
  the result in `NextResponse.json(...)` with the same `X-Deprecated`
  header and try/catch error handling as before.
- Helper functions/constants that were only used inside the extracted body
  (`compareStrings`, `PRODUCT_LOOKUP_STOPWORDS`, `tokenizeForProductLookup`,
  `buildLookupKeys`, a route-list-scoped `buildStrictSaleLookupKeysForList`,
  `enrichLastSaleDateForProducts`, `MAX_INVOICES`, `MAX_ISSUED_INVOICES_LIST`,
  `MAX_IMPORT_INVOICES`) moved with it into `product-aggregation.ts` as
  private (non-exported) declarations. `normalizeToken` and
  `normalizeDescriptionToken` were **not** duplicated — the extracted code
  now calls `product-aggregation.ts`'s own pre-existing private functions of
  the same name/behavior (byte-identical implementations already lived
  there). `XML_BATCH_SIZE` likewise reuses the file's existing constant
  (same value, 50) instead of being redeclared.
- Added new imports to `product-aggregation.ts`: `resolveAnvisaByCodeAndName`
  (from `@/lib/anvisa-open-data`), `getProductRegistryByKeys` (from
  `@/lib/product-registry-store`), `createLogger` (from `@/lib/logger`).
  Checked both new dependency modules for import cycles back to
  `product-aggregation.ts` — neither imports it, so no cycle introduced.
  `npm run build` (which type-checks the whole app) is the strongest
  confirmation of this.

### Naming-collision handling (`RouteAggregatedProduct`)

The per-request aggregation type (`invoiceIds: Set<string>`-based, distinct
from the lib's already-exported `AggregatedProduct` which uses
`invoiceCount`/`lastCountedInvoiceId` for the persisted rebuild job) was
renamed to `RouteAggregatedProduct` as the plan specifies — **but declared
in `src/lib/product-aggregation.ts`, not in `route.ts`**, because that is
where the actual naming collision would occur once the corrected plan moved
the entire extracted body (including this Map/interface) into
`product-aggregation.ts`. The plan's acceptance criterion
(`grep -c "RouteAggregatedProduct" route.ts == 2`) appears to be a stale
carry-over from an earlier draft where `buildProductsListPayload` — and
thus this type — was going to remain in `route.ts` itself. Once the
correction moved the extraction target to `product-aggregation.ts`, this
type necessarily moved with it (there is nothing left in `route.ts` that
would use it — `route.ts`'s `GET` no longer does any per-request
aggregation, it only calls `buildProductsListPayload`). Forcing a
redundant, unused `RouteAggregatedProduct` declaration back into `route.ts`
just to satisfy the literal grep would be dead code contradicting the
plan's own "pure Extract-Method, no logic changes" instruction and its
explicit "route.ts's GET() becomes: parse params ... call
buildProductsListPayload ... wrap in NextResponse.json" description. I
implemented the disambiguation in the file where it's actually needed and
am flagging this as a deviation rather than silently deviating.

### Acceptance criteria — Task 2

| Criterion | Result |
|---|---|
| `grep -c "^const UNIT_ALIASES" route.ts` == 0 | **PASS** (0) |
| `grep -c "^function normalizeUnit" route.ts` == 0 | **PASS** (0) |
| `grep -c "^function buildProductKey" route.ts` == 0 | **PASS** (0) |
| `grep -c "^async function extractProductsFromXml" route.ts` == 0 | **PASS** (0) |
| `grep -c "^interface ProductFromXml" route.ts` == 0 | **PASS** (0) |
| `grep -c "RouteAggregatedProduct" route.ts` == 2 | **FAIL/DEVIATION** (0 in route.ts; disambiguation implemented in `product-aggregation.ts` instead — see rationale above) |
| `grep -c "export async function buildProductsListPayload" route.ts` == 0 | **PASS** (0) |
| `grep -c "export async function buildProductsListPayload" product-aggregation.ts` == 1 | **PASS** (1) |
| `grep -c "buildProductsListPayload" route.ts` >= 1 | **PASS** (2 — import + call) |
| `grep -c "from '@/lib/product-aggregation'" route.ts` == 2 | **PASS** (2 — value import + type import) |
| `npm run build` exits 0 | **PASS** — confirmed twice, exit code 0 both times. This is the criterion that failed in attempt #1; it now passes under the corrected plan. |

## Task 3 — Verify byte-identical behavior post-refactor

Re-ran the Task 1 snapshot test (unmodified test file, unmodified `.snap`)
against the refactored code, plus build and lint.

| Criterion | Result |
|---|---|
| `npx vitest run src/lib/__tests__/products-route-dedup.test.ts` exits 0 | **PASS** — 1 test file, 1 test, passed. Snapshot matched byte-for-byte against the pre-refactor baseline captured in Task 1 (no `--update` needed, no diff). |
| `npm run build` exits 0 | **PASS** |
| `npm run lint` exits 0 | **PASS** (`eslint .` clean) |

## Success criteria (phase-level)

- `route.ts` has zero inline declarations of `UNIT_ALIASES`, `normalizeUnit`,
  `buildProductKey`, `extractProductsFromXml`, `ProductFromXml` — all now
  imported from `@/lib/product-aggregation`. **Met.**
- GET /api/products response is byte-identical before/after, proven by the
  vitest snapshot (Task 1 baseline == Task 3 result, unchanged). **Met.**
- `buildProductsListPayload` + `ProductsListQueryParams` are exported from
  `src/lib/product-aggregation.ts` and ready for reuse by Plan 12-03 (an
  in-process import, no HTTP round-trip needed). **Met** — note the import
  path for 12-03 is `@/lib/product-aggregation`, not
  `@/app/api/products/route` (the latter is architecturally impossible
  under Next.js 15's route-export rules; this is the whole reason for the
  plan correction). Flagging this explicitly in case 12-03's plan text
  still references the old path.

## Files touched

- `src/app/api/products/route.ts` — reduced from 1454 lines to ~55 lines;
  now a thin orchestrator (auth, param parsing, delegate to
  `buildProductsListPayload`, wrap response).
- `src/lib/product-aggregation.ts` — grew by ~1350 lines: added
  `ProductsListQueryParams`, `RouteAggregatedProduct` (private),
  `buildProductsListPayload`, and its private helper functions
  (`compareStrings`, `tokenizeForProductLookup`, `buildLookupKeys`,
  `buildStrictSaleLookupKeysForList`, `enrichLastSaleDateForProducts`), plus
  new imports (`resolveAnvisaByCodeAndName`, `getProductRegistryByKeys`,
  `createLogger`). `UNIT_ALIASES` export (already applied before this run)
  confirmed unchanged.
- `src/lib/__tests__/products-route-dedup.test.ts` +
  `src/lib/__tests__/__snapshots__/products-route-dedup.test.ts.snap` —
  unchanged from Task 1 (commit `728ba1e`), re-verified passing both before
  and after this run's changes.

## Commit

This run commits `route.ts` and `product-aggregation.ts` (the Task 2/3
changes). The test + snapshot were already committed in `728ba1e` from the
prior session and are not re-committed here.
