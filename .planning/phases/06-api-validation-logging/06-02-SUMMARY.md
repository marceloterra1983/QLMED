---
phase: 06-api-validation-logging
plan: 02
subsystem: lib-logging
tags: [logging, pino, structured-logging, console-replacement]
dependency_graph:
  requires: [06-01]
  provides: [structured-logging-in-lib]
  affects: [src/lib/]
tech_stack:
  added: []
  patterns: [pino-child-logger, object-first-logging]
key_files:
  created: []
  modified:
    - src/lib/auto-sync.ts
    - src/lib/local-xml-sync.ts
    - src/lib/product-aggregate-updater.ts
    - src/lib/auth-options.ts
    - src/lib/bootstrap.ts
    - src/lib/cnpj-lookup.ts
    - src/lib/cnpj-monitor.ts
    - src/lib/env.ts
    - src/lib/ncm-lookup.ts
    - src/lib/prisma.ts
    - src/lib/product-registry-store.ts
    - src/lib/receita-nfse-client.ts
    - src/lib/receita-nfse-sync.ts
    - src/lib/sefaz-client.ts
    - src/lib/xml-file-store.ts
    - src/lib/financeiro-shared.ts
    - src/app/api/webhooks/n8n/route.ts
decisions:
  - Used createLogger with module-specific names (e.g., 'auto-sync', 'local-xml-sync') for structured context
  - Renamed loop variable 'log' to 'stuckLog' in recoverStuckSyncLogs to avoid shadowing module logger
  - Auth login failures use log.warn with type and email for security visibility
  - Progress/sync logs use log.info; verbose loop logs would use log.debug
metrics:
  duration: 801s
  completed: "2026-04-10T02:55:23Z"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 17
---

# Phase 06 Plan 02: Replace console calls in src/lib/ with structured pino logger

All 106 console.log/warn/error calls across 16 lib files replaced with structured pino logger using createLogger child loggers with module-specific names and pino object-first pattern.

## Tasks Completed

### Task 1: Replace console calls in high-volume lib files
**Commit:** 8a83c53

Replaced 78 console calls in the three highest-volume files:
- **auto-sync.ts** (38 calls): Sync status, progress, errors for SEFAZ/NSDocs/Receita
- **local-xml-sync.ts** (32 calls): File processing, OneDrive sync, reconciliation
- **product-aggregate-updater.ts** (8 calls): Nightly rebuild scheduling, tax extraction

### Task 2: Replace console calls in remaining lib files
**Commit:** 4c5e213

Replaced 28 console calls across 13 files:
- **auth-options.ts** (6): Login events with warn for failures, error for DB refresh
- **bootstrap.ts** (2): Service startup errors
- **cnpj-lookup.ts** (1), **cnpj-monitor.ts** (1), **ncm-lookup.ts** (1): Cache/monitor errors
- **env.ts** (2): Startup config validation
- **prisma.ts** (1): Bootstrap initialization
- **product-registry-store.ts** (1): pg_trgm fallback warning
- **receita-nfse-client.ts** (2): Decode/parse warnings
- **receita-nfse-sync.ts** (1): saveXmlToFile error
- **sefaz-client.ts** (3): SOAP errors, XML parse fallback
- **xml-file-store.ts** (3): File I/O errors
- **financeiro-shared.ts** (4): Financeiro fetch/save errors (deviation)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] financeiro-shared.ts not listed in plan but contains console calls in src/lib/**
- **Found during:** Task 2 verification
- **Issue:** Plan listed 15 files but `src/lib/financeiro-shared.ts` also had 4 console.error calls
- **Fix:** Added createLogger('financeiro-shared') and replaced all 4 calls
- **Files modified:** src/lib/financeiro-shared.ts
- **Commit:** 4c5e213

**2. [Rule 1 - Bug] Missing apiError import in webhooks/n8n route**
- **Found during:** Build verification
- **Issue:** src/app/api/webhooks/n8n/route.ts used `apiError()` but had no import (from 06-01)
- **Fix:** Added `import { apiError } from '@/lib/api-error'`
- **Files modified:** src/app/api/webhooks/n8n/route.ts
- **Commit:** 4c5e213

## Verification Results

- `grep -r "console\.(log|warn|error)" src/lib/ --include="*.ts"` returns no results
- `grep -rl "import.*logger" src/lib/ --include="*.ts"` returns 17 files (16 consumers + logger.ts)
- `npm run build` compiles successfully (types pass, pages generated)

## Known Stubs

None.

## Self-Check: PASSED

- All 16 modified lib files exist on disk
- Both commit hashes (8a83c53, 4c5e213) found in git log
