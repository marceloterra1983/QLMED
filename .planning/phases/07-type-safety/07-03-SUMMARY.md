---
phase: 07-type-safety
plan: 03
subsystem: types
tags: [typescript, type-safety, any-elimination]
dependency_graph:
  requires: [07-01]
  provides: [zero-any-codebase]
  affects: [src/lib, src/app]
tech_stack:
  added: []
  patterns: [typed-raw-sql-rows, typed-api-responses, unknown-catch-pattern]
key_files:
  created: []
  modified:
    - src/lib/ncm-lookup.ts
    - src/lib/contact-details-shared.ts
    - src/lib/contact-shared.ts
    - src/lib/certificate-manager.ts
    - src/lib/anvisa-api.ts
    - src/lib/auto-sync.ts
    - src/lib/cnpj-utils.ts
    - src/lib/cnpj-monitor.ts
    - src/lib/product-settings-catalog.ts
    - src/lib/receita-nfse-sync.ts
    - src/lib/stock-entry-store.ts
    - src/app/(painel)/cadastro/produtos/page-client.tsx
    - src/app/(painel)/cadastro/fornecedores/page-client.tsx
    - src/app/(painel)/cadastro/clientes/page-client.tsx
    - src/app/(painel)/financeiro/contas-receber/page-client.tsx
    - src/app/(painel)/financeiro/contas-pagar/page-client.tsx
    - src/app/(painel)/sistema/upload/page-client.tsx
    - src/app/(painel)/sistema/sync/page-client.tsx
    - src/app/(painel)/sistema/usuarios/page-client.tsx
    - src/app/(painel)/estoque/entrada-nfe/page-client.tsx
    - src/app/(painel)/cadastro/anvisa/page-client.tsx
    - src/app/(painel)/relatorios/valvulas-importadas/page-client.tsx
    - src/app/api/invoices/route.ts
    - src/app/api/products/route.ts
    - src/app/api/products/list/route.ts
    - src/app/api/products/auto-classify/route.ts
    - src/app/api/ncm/bulk-sync/route.ts
    - src/app/api/estoque/entrada-nfe/route.ts
    - src/app/api/estoque/entrada-nfe/[invoiceId]/route.ts
    - src/app/api/estoque/import-e509/route.ts
    - src/app/api/users/[id]/route.ts
decisions:
  - "Used typed row interfaces for all raw SQL queries instead of generic Record types"
  - "Replaced catch(err: any) with catch(err: unknown) + instanceof narrowing"
  - "Used Record<string, unknown> for dynamic Prisma where clauses built at runtime"
  - "Created local interfaces inside functions for API response shapes when not shared"
metrics:
  duration: 1295s
  completed: "2026-04-10T03:45:39Z"
---

# Phase 07 Plan 03: Eliminate Remaining any Summary

Eliminated all 142 occurrences of `: any` across 31 files in src/lib/, page-client components, and API routes, achieving zero any in the entire src/ directory.

## What Was Done

### Task 1: Type src/lib/ remaining any (11 files, ~35 occurrences)

- **ncm-lookup.ts**: Created typed row interfaces (`NcmSearchRow`, `NcmSortedRow`) for all raw SQL queries. Removed explicit callback parameter types where inference works.
- **contact-details-shared.ts**: Created `InvoiceMetaRow` interface for dynamic Prisma select results. Replaced `contactWhere: any` with `Prisma.InvoiceWhereInput`. Replaced `metaResponse: any` and `response: any` with `Record<string, unknown>`. Used `ensureArray<XmlDet>` instead of `ensureArray<any>`.
- **contact-shared.ts**: Created `CnpjCacheData` and `ContactOverrideData` interfaces for export enrichment maps. Used `Prisma.InvoiceWhereInput` for where clause. Typed `buildYearCountMap` parameter with intersection type.
- **certificate-manager.ts**: Typed forge bag callbacks with `forge.pkcs12.Bag` and `forge.pki.CertificateField`.
- **anvisa-api.ts**: Created `AnvisaApiItem` interface for API response items.
- **auto-sync.ts**: Replaced all 3 `catch(err: any)` with `catch(err: unknown)` + `instanceof Error` narrowing for safe `.message` access.
- **cnpj-utils.ts**: Created `CnpjApiResponse` interface for the CNPJ API response shape.
- **cnpj-monitor.ts**: Typed raw SQL result as `{ cnpj: string }[]`.
- **product-settings-catalog.ts**: Created `ProductSettingsCatalogRow` interface for raw SQL rows.
- **receita-nfse-sync.ts**: Used `Parameters<PrismaClient['invoice']['upsert']>[0]` for the upsert args type.
- **stock-entry-store.ts**: Typed values array as `(string | number | null)[]`.

**Commit:** 49676fd

### Task 2: Type page-client.tsx files and API routes (20 files, ~107 occurrences)

- **produtos/page-client.tsx** (21 any): Created inline interfaces (`SettingsLine`, `SettingsGroup`, `FiscalOption`, `ManufacturerOption`) for API filter data. Used `ProductRow` from existing types for CSV export maps. Typed auto-classify preview items.
- **fornecedores/page-client.tsx** (4 any): Created `ExportSupplier`, `ReceitaData`, `OverrideData` interfaces for CSV export.
- **clientes/page-client.tsx** (4 any): Created `ExportCustomer` interface, same pattern as fornecedores.
- **contas-pagar/contas-receber** (2 any each): Typed `loaded` as `Duplicata[]` to enable inference.
- **upload/page-client.tsx** (3 any): Used `FileSystemEntry`, `FileSystemFileEntry`, `FileSystemDirectoryEntry` from DOM types.
- **Other page-clients** (1 any each): All `catch(err: any)` replaced with `catch(err: unknown)`.
- **API routes** (16 any): Used `Record<string, unknown>` for dynamic where clauses. Created typed row interfaces for raw SQL results in products/list, auto-classify, import-e509, entrada-nfe.

**Commit:** dd6bc14

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

- `grep -rn ': any' src/ --include='*.ts' --include='*.tsx'` returns **0 lines**
- `npx tsc --noEmit` passes (no errors in modified files)
- `npm run build` succeeds

## Known Stubs

None.

## Self-Check: PASSED

- Commits 49676fd and dd6bc14 verified
- All key files exist
- Zero `: any` in src/ confirmed
