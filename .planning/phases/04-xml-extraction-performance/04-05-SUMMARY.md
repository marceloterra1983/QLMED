---
phase: 04-xml-extraction-performance
plan: 05
subsystem: financeiro-duplicatas
tags: [performance, xml-extraction, database, duplicatas]
dependency_graph:
  requires: []
  provides: [invoice_duplicata-table, duplicata-backfill]
  affects: [financeiro-duplicatas, contas-pagar, contas-receber]
tech_stack:
  added: []
  patterns: [shadow-table, sentinel-rows, cfop-sql-filter]
key_files:
  created:
    - src/lib/invoice-duplicata-store.ts
  modified:
    - src/lib/financeiro-duplicatas.ts
decisions:
  - Sentinel rows (__NONE__) for invoices with no duplicatas to avoid re-processing during backfill
  - Import fallback query uses LEFT JOIN excluding sentinel rows to find genuinely no-dup invoices
  - CFOP filtering moved to SQL WHERE clause instead of runtime XML extraction
metrics:
  duration: 235s
  completed: "2026-04-10T02:16:08Z"
  tasks_completed: 2
  tasks_total: 2
  files_changed: 2
---

# Phase 04 Plan 05: Persist Duplicata Data Summary

Duplicata data persisted to invoice_duplicata table; financeiro-duplicatas.ts rewritten to query table instead of loading xmlContent batches of 500 invoices for regex extraction.

## Tasks Completed

### Task 1: Create invoice_duplicata store (916327b)
- Created `src/lib/invoice-duplicata-store.ts` following invoice-tax-store.ts pattern
- Table schema: invoice_duplicata with id, invoice_id, company_id, dup fields, fatura fields
- UNIQUE(invoice_id, dup_numero, dup_vencimento) constraint
- Indexes on company_id and invoice_id
- `ensureInvoiceDuplicataTable()` with global init state pattern
- `upsertDuplicatas()` with DELETE+INSERT in transaction
- `backfillInvoiceDuplicatas()` processes 500 invoices per call, fetches xmlContent in batches of 100
- XML extraction helpers (extractDuplicatasFast, extractDuplicatasFallback) moved here from financeiro-duplicatas.ts
- Sentinel rows (__NONE__) inserted for invoices with no duplicatas to track processed state

### Task 2: Rewrite financeiro-duplicatas.ts (708ecb7)
- Replaced cursor-based xmlContent loop with two SQL queries against invoice_duplicata
- Query 1: JOIN invoice_duplicata with Invoice, filter by CFOP codes in WHERE clause
- Query 2: Import purchase fallback for invoices with import CFOP and no actual duplicatas
- Removed all XML parsing imports and functions (parseXmlSafe, extractDuplicatasFast, extractDuplicatasFallback, extractTagValue, val, num)
- Cache version bumped from v4 to v5
- File reduced from 426 lines to 280 lines (-34%)
- Zero xmlContent references remaining

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. `grep xmlContent src/lib/financeiro-duplicatas.ts` -- zero matches
2. `grep invoice_duplicata src/lib/financeiro-duplicatas.ts` -- 3 matches (table queries)
3. `grep parseXmlSafe src/lib/financeiro-duplicatas.ts` -- zero matches
4. TypeScript compiles both files without errors
5. invoice_duplicata table has proper indexes and unique constraint

## Known Stubs

None. Backfill function is fully implemented and callable. The table will be populated on first access via backfillInvoiceDuplicatas().

## Self-Check: PASSED
