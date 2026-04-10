---
phase: 10-major-upgrades
plan: 03
subsystem: database-orm
tags: [prisma, upgrade, database, adapter]
dependency_graph:
  requires: [10-01, 10-02]
  provides: [prisma-7, pg-adapter]
  affects: [prisma-client, certificate-manager, auto-sync]
tech_stack:
  added: ["prisma@7.7.0", "@prisma/adapter-pg@7.7.0", "pg@8.20.0", "@types/pg"]
  patterns: [prisma-7-adapter-pattern, prisma-config-ts, uint8array-bytes]
key_files:
  created:
    - prisma.config.ts
  modified:
    - package.json
    - package-lock.json
    - prisma/schema.prisma
    - src/lib/prisma.ts
    - src/lib/certificate-manager.ts
    - src/lib/auto-sync.ts
    - src/lib/receita-nfse-sync.ts
decisions:
  - "Used PrismaPg adapter pattern (Prisma 7 requirement) instead of direct URL in schema"
  - "Accepted Buffer | Uint8Array union type for pfxData fields instead of converting at call sites"
  - "Skipped prisma db push due to @@ignore shadow tables having extra columns not in schema"
  - "Placed prisma.config.ts at project root for auto-discovery by Prisma CLI"
metrics:
  duration: 648s
  completed: "2026-04-10T04:37:00Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 8
---

# Phase 10 Plan 03: Prisma 5 to 7 Upgrade Summary

Upgraded Prisma from 5.20.0 to 7.7.0 with adapter pattern, config migration, and Uint8Array compatibility fixes across certificate handling code.

## What Changed

### Prisma 7 Core Migration
- Upgraded `prisma` and `@prisma/client` from ^5.20.0 to ^7.7.0
- Added `@prisma/adapter-pg` and `pg` driver (new Prisma 7 requirement)
- Added `@types/pg` for TypeScript support

### Schema and Config Changes
- Removed `url = env("DATABASE_URL")` from `datasource` block in `prisma/schema.prisma` (Prisma 7 breaking change: connection URLs no longer in schema)
- Created `prisma.config.ts` at project root with `defineConfig()` pattern, dotenv loading, and datasource URL configuration
- This config is auto-discovered by all Prisma CLI commands (generate, db push, etc.)

### PrismaClient Adapter Pattern
- Updated `src/lib/prisma.ts` to use `PrismaPg` adapter instead of direct PrismaClient instantiation
- PrismaClient now receives `{ adapter: new PrismaPg(connectionString) }` instead of relying on env-based URL

### Bytes/Buffer Compatibility (Breaking Change)
- Prisma 7 returns `Uint8Array` for `Bytes` fields instead of `Buffer`
- Updated `CertificateInfo.pfxData` type to `Buffer | Uint8Array`
- Updated `CertificateManager.processPfx()`, `getHttpsOptions()`, `extractPems()` to accept both types
- Updated `auto-sync.ts` function signatures for Sefaz and Receita NFS-e sync
- Updated `receita-nfse-sync.ts` interface to accept `Uint8Array`
- Added `Buffer.from()` conversion in `processPfx` and `extractPems` where `toString('binary')` is called

## Verification Results

- `npx prisma --version` shows 7.7.0
- `npx prisma generate` succeeds
- `npx tsc --noEmit` passes with zero errors
- `npm run build` succeeds (all 70+ routes compile)
- Health endpoint `/api/health` returns `{"status":"ok","db":{"status":"connected","latencyMs":108}}`
- `prisma db push` NOT executed: @@ignore shadow tables have extra DB columns not in schema (e.g., `city` on `contact_fiscal`), running push would drop them

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] prisma.config.ts required for Prisma 7**
- **Found during:** Task 1
- **Issue:** Prisma 7 removed `url` from datasource block; needs prisma.config.ts for CLI and PrismaPg adapter for client
- **Fix:** Created prisma.config.ts with dotenv loading, updated PrismaClient to use PrismaPg adapter
- **Files created:** prisma.config.ts
- **Files modified:** prisma/schema.prisma, src/lib/prisma.ts

**2. [Rule 1 - Bug] Bytes fields return Uint8Array in Prisma 7**
- **Found during:** Task 1 (tsc --noEmit)
- **Issue:** 7 type errors across 4 files: pfxData from Prisma returns Uint8Array, code expects Buffer
- **Fix:** Updated CertificateManager and sync function signatures to accept Buffer | Uint8Array
- **Files modified:** src/lib/certificate-manager.ts, src/lib/auto-sync.ts, src/lib/receita-nfse-sync.ts

**3. [Rule 1 - Bug] prisma db push would drop shadow table columns**
- **Found during:** Task 1
- **Issue:** `prisma db push` would drop `city` column from `contact_fiscal` (69 non-null values)
- **Fix:** Skipped db push; shadow tables are managed by raw SQL and have extra columns not reflected in @@ignore models
- **Impact:** None - schema push is unnecessary since no model structures changed

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 6eb8aef | feat(10-03): upgrade Prisma 5 to Prisma 7 |
| 2 | (verification only) | Smoke test - health endpoint confirmed working |

## Known Stubs

None - all changes are fully wired and functional.

## Self-Check: PASSED

- All created/modified files verified present on disk
- Commit 6eb8aef verified in git log
