---
phase: "08"
plan: "04"
subsystem: file-splitting
tags: [refactor, split, settings, financeiro, xml-sync]
dependency_graph:
  requires: []
  provides: [SPLIT-04]
  affects: [settings-page, financeiro-pages, local-xml-sync]
tech_stack:
  added: []
  patterns: [component-extraction, module-directory]
key_files:
  created:
    - src/app/(painel)/sistema/settings/components/CertificateSection.tsx
    - src/app/(painel)/sistema/settings/components/IntegrationsSection.tsx
    - src/app/(painel)/sistema/settings/components/PreferencesSection.tsx
    - src/app/(painel)/financeiro/components/financeiro-utils.ts
    - src/app/(painel)/financeiro/components/DuplicataEditPanel.tsx
    - src/app/(painel)/financeiro/components/FinanceiroTable.tsx
    - src/lib/local-xml-sync/index.ts
    - src/lib/local-xml-sync/sync-types.ts
    - src/lib/local-xml-sync/sync-utils.ts
    - src/lib/local-xml-sync/onedrive-client.ts
    - src/lib/local-xml-sync/file-import.ts
    - src/lib/local-xml-sync/sync-scheduler.ts
  modified:
    - src/app/(painel)/sistema/settings/page-client.tsx
    - src/app/(painel)/financeiro/contas-pagar/page-client.tsx
    - src/app/(painel)/financeiro/contas-receber/page-client.tsx
  deleted:
    - src/lib/local-xml-sync.ts
decisions:
  - Adapted settings split from tab-based to section-based (actual code uses CollapsibleCards, not tabs)
  - Split settings into CertificateSection, IntegrationsSection, PreferencesSection instead of plan's CompanySettingsTab/UserManagementTab/SystemInfoTab
  - Unified financeiro components with direction prop (pagar/receber) to handle entity name differences
metrics:
  duration: 1062s
  completed: "2026-04-10T04:11:00Z"
---

# Phase 08 Plan 04: Split Settings, Financeiro, and Local-XML-Sync Summary

Split remaining large files into cohesive modules: settings page with 3 section components, financeiro pages with shared table/edit panel, local-xml-sync into 5 responsibility-based modules.

## Results

### Settings Page (1298 -> 68 lines)
- **page-client.tsx**: Thin orchestrator loading company data, rendering 3 sections
- **CertificateSection.tsx** (250 lines): Certificate upload, validation, delete
- **IntegrationsSection.tsx** (789 lines): NSDocs, Receita NFS-e, OneDrive integrations
- **PreferencesSection.tsx** (239 lines): Theme, notifications, profile, data export, danger zone

### Financeiro Pages (1159 -> ~440 lines each)
- **financeiro-utils.ts** (187 lines): Shared types, constants, and utility functions (parseCurrencyInput, roundMoney, toCurrencyInput, statusConfig, getNick, formatParcela)
- **DuplicataEditPanel.tsx** (393 lines): Full-screen duplicata editing panel with mobile/desktop layouts
- **FinanceiroTable.tsx** (245 lines): Sortable table with date grouping, mobile cards
- Both contas-pagar and contas-receber now import shared components with `direction` prop

### Local-XML-Sync (1115 lines -> 5 modules)
- **sync-types.ts** (22 lines): TargetCompany, OneDriveItemEntry, OneDriveChildrenResponse
- **sync-utils.ts** (65 lines): Pure utility functions (resolveConfiguredDir, isXmlFile, chunkArray, etc.)
- **onedrive-client.ts** (193 lines): OneDrive API functions (token refresh, Graph API, file download)
- **file-import.ts** (340 lines): File import, DB interaction, queue management
- **sync-scheduler.ts** (533 lines): Watchers, reconciliation, copy-from-source, scheduling
- **index.ts** (4 lines): Re-exports startLocalXmlSync, ensureLocalXmlSyncNow

## Line Count Verification

| File | Before | After |
|------|--------|-------|
| settings/page-client.tsx | 1298 | 68 |
| contas-pagar/page-client.tsx | 1159 | 440 |
| contas-receber/page-client.tsx | 1159 | 441 |
| local-xml-sync.ts | 1115 | deleted (5 modules, max 533) |

## Deviations from Plan

### [Rule 3 - Blocking] Adapted settings split to match actual code structure
- **Found during:** Task 1
- **Issue:** Plan specified CompanySettingsTab, UserManagementTab, SystemInfoTab but the actual settings page uses CollapsibleCards without tabs. There is no user management or system info section.
- **Fix:** Split by actual sections: CertificateSection, IntegrationsSection, PreferencesSection
- **Files modified:** All settings components

## Commits

| Task | Commit | Message |
|------|--------|---------|
| 1 | a852c36 | refactor(08-04): split settings page-client and financeiro pages into modules |
| 2 | 9471c05 | refactor(08-04): split local-xml-sync.ts into 5 modules under directory |

## Known Stubs

None -- all components are fully wired to their data sources.

## Self-Check: PASSED
