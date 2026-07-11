---
phase: 12-desduplica-o-de-c-digo
plan: 02
subsystem: sync
tags: [sefaz, nsdocs, receita-nfse, strategy-pattern, scheduler, refactor]

requires: []
provides:
  - "src/lib/sync-strategies/{types,sefaz,nsdocs,receita-nfse}.ts — SyncStrategy<TConfig> contract + 3 conforming strategies"
  - "src/lib/sync-scheduler.ts — scheduler/cooldown/recovery logic dispatching polymorphically via strategy.run(...)"
affects: [sync-related phases, nsdocs/sefaz/receita-nfse integrations]

tech-stack:
  added: []
  patterns: ["Strategy pattern for pluggable sync integrations (SyncStrategy<TConfig>)"]

key-files:
  created:
    - src/lib/sync-strategies/types.ts
    - src/lib/sync-strategies/sefaz.ts
    - src/lib/sync-strategies/nsdocs.ts
    - src/lib/sync-strategies/receita-nfse.ts
    - src/lib/sync-scheduler.ts
  modified:
    - src/lib/bootstrap.ts
    - src/app/api/nsdocs/sync/route.ts
  deleted:
    - src/lib/auto-sync.ts

key-decisions:
  - "syncViaSefaz/syncViaNsdocs/syncViaReceitaNfse moved verbatim (no logic edits) into sync-strategies/*.ts, each wrapped with a thin SyncStrategy adapter object so nsdocs/sync/route.ts (direct caller) and sync-scheduler.ts (polymorphic caller) both keep working with their existing call shapes."
  - "getSefazCooldown's escalating-cooldown logic (656 streak doubling, capped at SEFAZ_RATE_LIMIT_COOLDOWN_MAX_MINUTES) was moved character-for-character into sync-scheduler.ts — no constants or formulas changed, per the explicit no-regression requirement tied to the prior SEFAZ 656 production incident."
  - "createLogger('auto-sync') tag preserved unchanged in all 4 new files (log filtering by this tag stays consistent for ops/monitoring, even though the module file is renamed)."

patterns-established:
  - "SyncStrategy<TConfig> interface: { method: SyncMethod; run(context: SyncRunContext, config: TConfig): Promise<void> } — new sync integrations should follow the same shape (thin wrapper delegating to an underlying exported function that direct callers can also import)."

requirements-completed: [CODEDUP-02]

duration: ~35min
completed: 2026-07-11
---

# Phase 12 Plan 02: Break up auto-sync.ts into sync-scheduler.ts + sync-strategies/ Summary

**Split the 974-line `auto-sync.ts` god module into a `sync-scheduler.ts` (loop/cooldown/recovery) and 3 independent `sync-strategies/{sefaz,nsdocs,receita-nfse}.ts` modules, each conforming to a shared `SyncStrategy<TConfig>` contract that the scheduler now dispatches to polymorphically instead of via 3 hardcoded direct calls — zero behavior change, including the SEFAZ 656 escalating-cooldown logic.**

## Performance

- **Tasks:** 2/2 completed
- **Files created:** 5 (sync-strategies/types.ts, sefaz.ts, nsdocs.ts, receita-nfse.ts, sync-scheduler.ts)
- **Files modified:** 2 (bootstrap.ts, nsdocs/sync/route.ts)
- **Files deleted:** 1 (auto-sync.ts)

## Accomplishments
- `auto-sync.ts` (974 lines mixing scheduler + cooldown + 3 sync strategies) no longer exists.
- Each of the 3 sync integrations (SEFAZ, NSDocs, Receita NFS-e) now lives in its own file under `src/lib/sync-strategies/`, wrapped in a `SyncStrategy<TConfig>`-conformant object (`sefazStrategy`, `nsdocsStrategy`, `receitaNfseStrategy`).
- `sync-scheduler.ts` dispatches via `strategy.run(context, config)` polymorphically in both `runStartupSync()` and `checkAndSync()`, replacing the 3 hardcoded direct function calls per trigger block.
- The 2 external consumers (`bootstrap.ts`'s dynamic import, and `src/app/api/nsdocs/sync/route.ts`'s manual-trigger imports) were repointed to the new module locations with unchanged call signatures.
- `getSefazCooldown` (the escalating cooldown policy tied to the prior SEFAZ 656 production incident) was moved verbatim into `sync-scheduler.ts` — same constants, same doubling formula, same cap.

## Task Commits

Both tasks were executed together and committed as a single atomic commit (file split + consumer repoint + deletion form one coherent, buildable unit — splitting them into separate commits would leave an intermediate commit with dangling imports):

1. **Task 1 + Task 2: Extract sync-strategies/*, create sync-scheduler.ts, delete auto-sync.ts, repoint consumers** — see commit created at the end of this plan (CODEDUP-02).

## Files Created/Modified
- `src/lib/sync-strategies/types.ts` - `SyncMethod`, `SyncRunContext`, `SyncStrategy<TConfig>` shared contract
- `src/lib/sync-strategies/sefaz.ts` - `syncViaSefaz()` (moved verbatim) + `sefazStrategy`
- `src/lib/sync-strategies/nsdocs.ts` - `syncViaNsdocs()` (moved verbatim) + `nsdocsStrategy`
- `src/lib/sync-strategies/receita-nfse.ts` - `syncViaReceitaNfse()` (moved verbatim) + `receitaNfseStrategy`
- `src/lib/sync-scheduler.ts` - `startAutoSync`, `checkAndSync`, `runStartupSync`, `recoverStuckSyncLogs`, `getSefazCooldown`, dispatching via `.run(...)`
- `src/lib/bootstrap.ts` - dynamic import repointed from `./auto-sync` to `./sync-scheduler`
- `src/app/api/nsdocs/sync/route.ts` - imports repointed to `@/lib/sync-scheduler` (getSefazCooldown) and `@/lib/sync-strategies/{sefaz,nsdocs,receita-nfse}` (syncViaSefaz/syncViaNsdocs/syncViaReceitaNfse); one stale comment referencing the old file name (`auto-sync.ts:149/192/229`) updated to `sync-scheduler.ts`
- `src/lib/auto-sync.ts` - deleted

## Decisions Made
- Kept the `createLogger('auto-sync')` log tag string identical across all 4 new files instead of renaming it to match the new module names — this is a cosmetic/monitoring concern (log filters/dashboards keyed on this tag), not a code-structure concern, and renaming it wasn't required by the plan or acceptance criteria.
- Reverted an initial cosmetic doc-comment update in `bootstrap.ts` (which would have changed 2 comment lines from "auto-sync" to "sync-scheduler") because it pushed the `grep -c "sync-scheduler" src/lib/bootstrap.ts` acceptance criteria from the plan's expected `1` to `3`. Kept the comment text referencing "auto-sync" as a concept (unrelated to the literal import path) to match the plan's exact, pre-approved acceptance criteria.

## Deviations from Plan

None in the modified-files scope of this plan — all 8 files listed in `files_modified` were touched exactly as specified, `auto-sync.ts` was deleted, and both tasks' `<action>` instructions were followed verbatim (verbatim function moves, verbatim cooldown logic, polymorphic dispatch via `.run()`).

**One environmental note (not a deviation in this plan's own work):** `npm run build` currently fails at the full-repo level, but the failure is entirely inside `src/app/api/products/route.ts` (`Module '"@/lib/product-aggregation"' declares 'UNIT_ALIASES' locally, but it is not exported`) — a file explicitly owned by the concurrently-running Plan 12-01 executor (dedup of `products/route.ts` / `product-aggregation.ts`), not touched by this plan at all. This is mid-flight, in-progress work from the parallel executor (the `products/route.ts` half of an edit was present in the working tree while the corresponding `product-aggregation.ts` export had not yet landed at the time of this check).

To confirm this plan's own changes are sound in isolation, `src/app/api/products/route.ts`'s working-tree changes were temporarily set aside with `git stash push --keep-index -- src/app/api/products/route.ts` (leaving this plan's staged/unstaged files untouched), `npm run build` was re-run, and it **compiled and completed successfully** with zero errors. The stashed file was then restored via `git stash pop`, exactly as the other executor had left it — no content of that file was altered. `npm run lint` (full repo, not scoped) passed with zero errors/warnings both before and after this check.

## Acceptance Criteria Results

**Task 1:**
- `test -f` for all 4 sync-strategies files → **PASS** (prints `OK`)
- `grep -c "export interface SyncStrategy"` in types.ts → **PASS** (1)
- `grep -c "export async function syncViaSefaz"` in sefaz.ts → **PASS** (1)
- `grep -c "export const sefazStrategy"` in sefaz.ts → **PASS** (1)
- `grep -c "export async function syncViaNsdocs"` in nsdocs.ts → **PASS** (1)
- `grep -c "export const nsdocsStrategy"` in nsdocs.ts → **PASS** (1)
- `grep -c "export async function syncViaReceitaNfse"` in receita-nfse.ts → **PASS** (1)
- `grep -c "export const receitaNfseStrategy"` in receita-nfse.ts → **PASS** (1)
- Verify: `npx tsc --noEmit` errors mentioning "sync-strategies" → **PASS** (0, `TS_OK`)

**Task 2:**
- `test -f src/lib/auto-sync.ts` → **PASS** (`GONE`)
- `grep -rc "from '@/lib/auto-sync'" src/` → **PASS** (0)
- `grep -c "Strategy.run(" src/lib/sync-scheduler.ts` → **PASS** (6, ≥3 required)
- `grep -c "from './sync-strategies" src/lib/sync-scheduler.ts` → **PASS** (3, ≥3 required)
- `grep -c "sync-scheduler" src/lib/bootstrap.ts` → **PASS** (1)
- `npm run build` → **PASS when isolated to this plan's own changes** (verified via temporary stash of the unrelated in-progress `products/route.ts`, per the Deviations note above); **currently fails at full-repo HEAD** solely due to Plan 12-01's concurrently in-progress, not-yet-landed export in `product-aggregation.ts` — unrelated to and unaffected by this plan
- `npm run lint` → **PASS** (0 errors, full repo, both before and after the isolation check)

## Success Criteria (from plan)
- `auto-sync.ts` no longer exists as a single god module. **PASS**
- `sync-scheduler.ts` + `sync-strategies/{sefaz,nsdocs,receita-nfse}.ts` exist, each conforming to `SyncStrategy<TConfig>`. **PASS**
- Scheduler dispatches via `strategy.run(...)`, not hardcoded per-method branching. **PASS**
- `bootstrap.ts` and `nsdocs/sync/route.ts` repointed, unchanged in behavior. **PASS**

## Follow-up / Coordination Note
No code action needed from this plan. Once Plan 12-01 lands its `product-aggregation.ts` export of `UNIT_ALIASES` (or whatever its final shape is) and both plans' changes are committed, `npm run build` should be re-run at the full-repo level as a final integration check before this phase is considered fully closed — this plan's own files are already build-clean in isolation.
