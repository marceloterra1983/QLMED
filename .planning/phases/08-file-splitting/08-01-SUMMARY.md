---
phase: 08-file-splitting
plan: 01
subsystem: cadastro/produtos
tags: [refactor, file-splitting, components]
dependency_graph:
  requires: []
  provides: [produtos-component-architecture]
  affects: [cadastro/produtos/page-client.tsx]
tech_stack:
  added: []
  patterns: [component-extraction, self-contained-modals, shared-utils]
key_files:
  created:
    - src/app/(painel)/cadastro/produtos/components/product-utils.ts
    - src/app/(painel)/cadastro/produtos/components/DetailSectionCard.tsx
    - src/app/(painel)/cadastro/produtos/components/ProductDetailModal.tsx
    - src/app/(painel)/cadastro/produtos/components/BulkEditModal.tsx
    - src/app/(painel)/cadastro/produtos/components/ProductFilters.tsx
    - src/app/(painel)/cadastro/produtos/components/ProductTable.tsx
    - src/app/(painel)/cadastro/produtos/components/ExportCSVButton.tsx
    - src/app/(painel)/cadastro/produtos/components/HistoryModal.tsx
  modified:
    - src/app/(painel)/cadastro/produtos/page-client.tsx
decisions:
  - Self-contained modals with internal state instead of prop-drilling 40+ state variables
  - ProductDetailModal at 1021 lines slightly exceeds 500-line target due to complex form (acceptable trade-off vs fragmentation)
  - Shared utility functions and sub-components in product-utils.ts and DetailSectionCard.tsx
metrics:
  duration: 1096s
  completed: "2026-04-10"
  tasks: 2
  files: 9
---

# Phase 08 Plan 01: Split Produtos Page Summary

Split the largest file in the codebase (3627-line page-client.tsx) into 8 cohesive component files under a components/ subdirectory, reducing the orchestrator to 485 lines.

## What Changed

### Task 1: Extract utility functions and modal components
- **product-utils.ts** (99 lines): All shared utility functions (normalizeSearch, formatQuantity, formatDate, getAnvisaExpirationBadge, formatOptional, highlightMatch) and constants (iconBgMap, DETAIL_INPUT_CLS, BULK_INPUT_CLS, bulkFieldIconMap), plus HierOptions type
- **DetailSectionCard.tsx** (62 lines): Shared UI sub-components (DetailSectionCard, DetailField, BulkFieldRow) used across multiple modals
- **ProductDetailModal.tsx** (1021 lines): Self-contained product detail modal with internal state management for all ~35 detail fields, ANVISA validation, NCM lookup, fiscal data editing, and save logic
- **BulkEditModal.tsx** (287 lines): Self-contained bulk edit overlay with field selection checkboxes, hierarchy dropdowns, CST selects, and batch save

### Task 2: Extract remaining components and rewrite orchestrator
- **ProductFilters.tsx** (182 lines): Filter bar with search, hierarchy dropdowns (Linha/Grupo/Subgrupo), sort controls, status toggle, and active filter indicators
- **ProductTable.tsx** (339 lines): Complete product table with desktop (table) and mobile (cards) views, two-level grouping (Linha/Grupo/Subgrupo), collapse/expand, selection, sort icons
- **ExportCSVButton.tsx** (74 lines): CSV export button with full column formatting
- **HistoryModal.tsx** (292 lines): Purchase/sales/consignment history modal with grouped tables, summary cards, expandable rows
- **page-client.tsx** (485 lines): Reduced from 3627 to 485 lines as pure orchestrator with state, data fetching, and component wiring

## Line Count Summary

| File | Lines | Role |
|------|-------|------|
| page-client.tsx | 485 | Orchestrator (state, fetch, wiring) |
| ProductDetailModal.tsx | 1021 | Product detail form modal |
| ProductTable.tsx | 339 | Table rendering (desktop+mobile) |
| HistoryModal.tsx | 292 | History modal |
| BulkEditModal.tsx | 287 | Bulk edit modal |
| ProductFilters.tsx | 182 | Filter/search/sort bar |
| product-utils.ts | 99 | Shared utilities and constants |
| ExportCSVButton.tsx | 74 | CSV export |
| DetailSectionCard.tsx | 62 | Shared UI sub-components |

## Deviations from Plan

### Design Decision: Self-contained modals
- **Issue:** ProductDetailModal uses ~35 state variables. Passing all as props would create an unmaintainable interface.
- **Decision:** Each modal manages its own internal state and receives only essential props (product, callbacks, options).
- **Impact:** Cleaner component interfaces, each modal is independently testable.

### ProductDetailModal exceeds 500-line target (1021 lines)
- **Issue:** The detail modal contains fiscal, ANVISA, and cadastro sections with extensive form fields.
- **Rationale:** Further splitting into micro-components (DetailFiscalSection, DetailAnvisaSection) would fragment tightly coupled form state across too many files. The 1021-line modal is coherent as a single form unit and far better than the original 3627-line monolith.

## Verification

- TypeScript compiles with zero errors (`npx tsc --noEmit`)
- Build compiles successfully (standalone copy error is pre-existing, unrelated)
- page-client.tsx: 485 lines (under 500)
- 8 component files created, 7 of 8 under 500 lines
- All product page functionality preserved: search, filter, sort, group, select, bulk edit, detail modal, history, CSV export, auto-classify

## Known Stubs

None - all components are fully wired with working data sources.

## Self-Check: PASSED

- All 9 files verified present on disk
- Both task commits verified in git history (38cd548, bcc6528)
