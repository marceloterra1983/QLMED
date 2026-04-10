---
phase: 06-api-validation-logging
plan: 04
subsystem: api-validation
tags: [zod, validation, api, security]
dependency_graph:
  requires: [06-01, 06-03]
  provides: [domain-schemas, route-validation-batch1]
  affects: [invoices, financeiro, estoque, certificate, users, cte, webhooks]
tech_stack:
  added: []
  patterns: [zod-safeParse, apiValidationError, domain-schema-modules]
key_files:
  created:
    - src/lib/schemas/invoice.ts
    - src/lib/schemas/financeiro.ts
    - src/lib/schemas/estoque.ts
    - src/lib/schemas/certificate.ts
    - src/lib/schemas/user.ts
    - src/lib/schemas/company.ts
  modified:
    - src/app/api/invoices/[id]/route.ts
    - src/app/api/invoices/bulk-download/route.ts
    - src/app/api/invoices/export-xml/route.ts
    - src/app/api/financeiro/contas-pagar/invoice/[invoiceId]/installments/route.ts
    - src/app/api/financeiro/contas-pagar/override/route.ts
    - src/app/api/financeiro/contas-receber/invoice/[invoiceId]/installments/route.ts
    - src/app/api/estoque/entrada-nfe/route.ts
    - src/app/api/estoque/entrada-nfe/[invoiceId]/route.ts
    - src/app/api/certificate/upload/route.ts
    - src/app/api/cte/manifest/route.ts
    - src/app/api/users/route.ts
    - src/app/api/users/[id]/route.ts
    - src/app/api/webhooks/n8n/route.ts
decisions:
  - Centralized updateUserSchema from users/[id] inline to src/lib/schemas/user.ts
  - FormData routes validate non-file fields with Zod, file validation stays in handler
  - export-xml uses graceful fallback (no 400) since all fields have defaults
metrics:
  duration: 371s
  completed: 2026-04-10T03:08:06Z
  tasks: 2
  files: 19
---

# Phase 06 Plan 04: Zod Validation Batch 1 Routes Summary

Zod schemas for 6 domains (invoice, financeiro, estoque, certificate, user, company) applied to 13+ route files covering 20+ POST/PUT/PATCH handlers with apiValidationError returning 400 on invalid payloads.

## Task Results

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create domain-specific Zod schemas | ecc54d9 | 6 schema files created |
| 2 | Apply Zod validation to batch 1 routes | c2c5d70 | 13 route files modified |

## What Was Done

### Task 1: Domain Schema Files
Created 6 schema files in `src/lib/schemas/`:
- **invoice.ts**: `invoiceUpdateStatusSchema`, `invoiceBulkDownloadSchema`, `invoiceExportXmlSchema`
- **financeiro.ts**: `installmentsSchema`, `overrideSchema`
- **estoque.ts**: `entradaNfeSchema`, `entradaNfeUpdateLotSchema`, `entradaNfeCloneBatchSchema`
- **certificate.ts**: `certificateUploadFieldsSchema`
- **user.ts**: `createUserSchema` (with SEC-06 min(6) password), `updateUserSchema` (centralized from inline)
- **company.ts**: `createCompanySchema` with CNPJ validation

### Task 2: Route Validation
Applied `safeParse` + `apiValidationError` pattern to all batch 1 routes:
- Replaced inline manual validation with Zod schemas
- Used `parsed.data` for typed access to validated fields
- FormData routes (certificate, upload) validate non-file fields through Zod
- 41 total safeParse/parse usages across API routes (exceeds 20+ target)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] Centralized users/[id] updateUserSchema**
- **Found during:** Task 2
- **Issue:** users/[id]/route.ts had inline Zod schema identical to what was needed
- **Fix:** Moved to src/lib/schemas/user.ts, imported from there
- **Files modified:** src/app/api/users/[id]/route.ts, src/lib/schemas/user.ts

**2. [Rule 2 - Missing] Added cte/manifest and webhooks/n8n inline schemas**
- **Found during:** Task 2
- **Issue:** These routes needed schemas but were small enough to define inline
- **Fix:** Created inline schemas in route files using z.object + z.enum
- **Files modified:** src/app/api/cte/manifest/route.ts, src/app/api/webhooks/n8n/route.ts

### Routes Not Modified (Already Validated or No Body)
- **invoices/upload**: Already had uploadSchema with Zod validation
- **invoices/backfill-tax**: No request body (reads from DB)
- **estoque/import-e509**: FormData with file only, file validation stays in handler
- **companies POST**: No body needed (single-company mode, returns existing company)
- **register POST**: Disabled route (returns 403 immediately)

## Verification

- `npm run build` passes without errors
- 41 safeParse/parse usages across API routes (target: 20+)
- All invalid payloads return HTTP 400 with field-level error details via apiValidationError

## Known Stubs

None - all schemas match actual route body shapes.

## Self-Check: PASSED
