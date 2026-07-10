---
phase: 08-file-splitting
plan: 02
subsystem: pdf-generation
tags: [refactor, file-splitting, pdf]
dependency_graph:
  requires: []
  provides: [pdf-types, pdf-utils, pdf-css, danfe-generator, dacte-generator, nfse-generator]
  affects: [invoices-pdf-route]
tech_stack:
  added: []
  patterns: [module-extraction, thin-router]
key_files:
  created:
    - src/lib/pdf/pdf-types.ts
    - src/lib/pdf/pdf-utils.ts
    - src/lib/pdf/pdf-css.ts
    - src/lib/pdf/danfe-generator.ts
    - src/lib/pdf/dacte-generator.ts
    - src/lib/pdf/nfse-generator.ts
  modified:
    - src/app/api/invoices/[id]/pdf/route.ts
decisions:
  - buildFallbackHtml placed in danfe-generator as it uses DANFE CSS and is a general-purpose fallback
  - HTML template strings kept in generator files (not further split) since they are tightly coupled to their data extraction functions
metrics:
  duration: 644s
  completed: "2026-04-10T03:59:35Z"
  tasks_completed: 2
  tasks_total: 2
  files_created: 6
  files_modified: 1
---

# Phase 08 Plan 02: Split PDF Route Summary

Split PDF route (2279 lines) into 6 focused modules under src/lib/pdf/ with thin router dispatch

## What Was Done

### Task 1: Create pdf-types, pdf-utils, pdf-css, and DANFE generator (d987055)

- Extracted all PDF interfaces and types (PdfInvoiceView, DanfeData, CteData, NfseData, etc.) to `src/lib/pdf/pdf-types.ts` (246 lines)
- Extracted shared helper functions (parseXml, esc, fmtCnpj, fmtCep, fmtFone, fmtNum, fmtCurrency, fmtKey, fmtDate, etc.) to `src/lib/pdf/pdf-utils.ts` (110 lines)
- Extracted shared CSS constant to `src/lib/pdf/pdf-css.ts` (58 lines)
- Extracted DANFE NF-e generator (extractDanfeData, buildDanfeHtml, buildFallbackHtml) to `src/lib/pdf/danfe-generator.ts` (707 lines)

### Task 2: Extract DACTE, NFS-e generators and rewrite route (7ab04ac)

- Extracted CT-e DACTE generator (extractCteData, buildCteDataFromInvoice, buildCteHtml) to `src/lib/pdf/dacte-generator.ts` (670 lines)
- Extracted NFS-e generator (extractNfseData, buildNfseHtml) to `src/lib/pdf/nfse-generator.ts` (369 lines)
- Rewrote route.ts as thin dispatcher: 148 lines (from 2279 -- 93.5% reduction)

## Line Count Summary

| File | Lines | Role |
|------|-------|------|
| route.ts | 148 | Thin router (auth, DB query, dispatch, Puppeteer) |
| pdf-types.ts | 246 | All interfaces and types |
| pdf-utils.ts | 110 | Shared formatting helpers |
| pdf-css.ts | 58 | Shared CSS constant |
| danfe-generator.ts | 707 | NF-e DANFE extraction + HTML |
| dacte-generator.ts | 670 | CT-e DACTE extraction + HTML |
| nfse-generator.ts | 369 | NFS-e extraction + HTML |
| **Total** | **2308** | (vs original 2285 -- 23 lines from import statements) |

## Deviations from Plan

### Notes

- DANFE and DACTE generators exceed the 500-line target (707 and 670 respectively). This is because they contain large HTML template literals that are tightly coupled to their data extraction functions. Splitting the HTML templates into separate files would not improve maintainability. The route.ts target of under 150 lines was met (148 lines).
- Pre-existing build failure in SupplierDetailsModal.tsx (RowActions undefined) is unrelated to this plan's changes. TypeScript compilation (`tsc --noEmit`) passes cleanly.

## Known Stubs

None -- all code is fully functional, extracted verbatim from the original route.

## Decisions Made

1. **buildFallbackHtml in danfe-generator**: Placed in danfe-generator.ts since it uses the shared PDF_CSS and serves as a general-purpose fallback for any document type
2. **No further splitting of generators**: HTML template strings are kept alongside their data extraction functions for cohesion -- splitting would create artificial boundaries

## Self-Check: PASSED
