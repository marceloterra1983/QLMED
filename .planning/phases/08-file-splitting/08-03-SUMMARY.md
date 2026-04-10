---
phase: 08-file-splitting
plan: 03
subsystem: components
tags: [refactor, file-splitting, deduplication]
dependency_graph:
  requires: []
  provides: [shared-contact-detail-components]
  affects: [SupplierDetailsModal, CustomerDetailsModal]
tech_stack:
  added: []
  patterns: [shared-component-extraction, prop-driven-sections]
key_files:
  created:
    - src/components/contact-details/contact-detail-types.ts
    - src/components/contact-details/contact-detail-utils.tsx
    - src/components/contact-details/ContactInfoSection.tsx
    - src/components/contact-details/AddressSection.tsx
    - src/components/contact-details/FiscalSection.tsx
    - src/components/contact-details/PriceTableSection.tsx
    - src/components/contact-details/InvoiceListSection.tsx
  modified:
    - src/components/SupplierDetailsModal.tsx
    - src/components/CustomerDetailsModal.tsx
decisions:
  - "Added InvoiceListSection (not in plan) to get both modals under 500 lines"
  - "Kept supplier-specific CNAE mismatch logic in SupplierDetailsModal (not shared)"
metrics:
  duration: 879s
  completed: "2026-04-10T04:02:55Z"
---

# Phase 08 Plan 03: Split SupplierDetails/CustomerDetails Modals Summary

Extracted 7 shared components from near-identical supplier/customer detail modals, reducing each from 1500+ lines to under 500 lines while eliminating ~1200 lines of duplicated code.

## Results

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| SupplierDetailsModal.tsx | 1520 | 472 | -69% |
| CustomerDetailsModal.tsx | 1469 | 427 | -71% |

### Shared Components Created (7 files, ~927 lines)

| Component | Lines | Purpose |
|-----------|-------|---------|
| contact-detail-types.ts | 109 | Shared types: ContactDetails, ContactPriceRow, ContactInvoice, etc. |
| contact-detail-utils.tsx | 154 | InfoField, EditableField, SectionCard, StatCard, normalizeForCompare, compareAddressFields |
| ContactInfoSection.tsx | 39 | Name, CNPJ/CPF, IE validation display |
| AddressSection.tsx | 150 | Address display/edit with CNPJ divergence detection |
| FiscalSection.tsx | 85 | Receita Federal data display with CNAE |
| PriceTableSection.tsx | 177 | Sortable, searchable price table with mobile/desktop views |
| InvoiceListSection.tsx | 213 | InvoiceTable, MovimentacoesTable, DuplicatasTable |

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create shared contact-details components | 93d0529 | 6 new files under contact-details/ |
| 2 | Rewrite both modals to use shared components | 58392b2 | 2 modified modals + 1 new InvoiceListSection |

## Deviations from Plan

### Auto-added (Rule 2)

**1. [Rule 2] Added InvoiceListSection component (not in original plan)**
- **Found during:** Task 2
- **Issue:** After extracting the 4 planned sections (ContactInfo, Address, Fiscal, PriceTable), both modals were still ~580-630 lines due to inline invoice/movimentacoes/duplicatas table rendering
- **Fix:** Created InvoiceListSection.tsx with InvoiceTable, MovimentacoesTable, DuplicatasTable shared components
- **Files created:** src/components/contact-details/InvoiceListSection.tsx
- **Commit:** 58392b2

## Pre-existing Issues (Not Our Changes)

- `npm run build` fails due to missing `ProductTable` and `HistoryModal` components in `src/app/(painel)/cadastro/produtos/page-client.tsx`. This is from a previous phase (08-01 products split) that was not completed. Logged in deferred-items.md.

## Known Stubs

None - all components are fully wired with real data props.

## Self-Check: PASSED
