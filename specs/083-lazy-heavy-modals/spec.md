---
id: SPEC-083
status: approved
owner: QLMED
affected_modules:
  - cadastro-produtos
  - contact-details
  - estoque-controle
  - next-config
related:
  - SPEC-077
---

# Feature Specification: Lazy-load de modais pesados e pacotes nativos no servidor

**Feature Branch**: `feat/083-lazy-heavy-modals`

**Created**: 2026-09-20

**Status**: Approved

**Input**: Skills `vercel-react-best-practices` (`bundle-dynamic-imports`,
`bundle-barrel-imports`) e docs Next 15 `serverExternalPackages`. Páginas
fiscais já usam `next/dynamic`; Produtos e ContactDetails ainda puxavam
modais de 600–1000 linhas no chunk inicial.

## Problem

O catálogo de produtos e o modal de contato importavam
`InvoiceDetailsModal`, `NfeDetailsModal` e vários modais de produto de
forma estática. `exceljs`, `jszip` e `puppeteer-core` não estavam em
`serverExternalPackages` (só `xml2js`).

## Roles and ownership

Inalterado. Isolamento por empresa inalterado. Sem mudança de contrato HTTP.

## Acceptance criteria

1. **AC-083-001** — `cadastro/produtos/page-client.tsx` carrega
   `InvoiceDetailsModal`, `ProductDetailModal`, `SettingsModal`,
   `BulkEditModal`, `ImportSpicaModal` e `HistoryModal` via `next/dynamic`
   com `{ ssr: false }`.
2. **AC-083-002** — `ContactDetailsModal` e `ProductStockDetailModal`
   carregam `InvoiceDetailsModal` / `NfeDetailsModal` via `next/dynamic`.
3. **AC-083-003** — `next.config.mjs` inclui `exceljs`, `jszip` e
   `puppeteer-core` em `serverExternalPackages`.

## Out of scope

Cache Components / Partial Prefetch (Next 16). React Compiler (dep nova).
Auditoria Vercel Optimize (hosting próprio). Promise.all no GET
`/api/invoices` (`resolveListTotal` já omite COUNT). DROP Float.
