---
id: SPEC-082
status: approved
owner: QLMED
affected_modules:
  - stock-entry
  - fiscal-by-cfop
  - financeiro-duplicatas
related:
  - SPEC-004
---

# Feature Specification: Ler sidecars Decimal já expandidos

**Feature Branch**: `feat/082-decimal-sidecar-reads`

**Created**: 2026-09-20

**Status**: Approved

**Input**: SPEC-004 T009 já dual-escreve Decimal em stock_entry / nfe_entry_item /
invoice_item_tax. A leitura ainda usava Float em mapNfeEntryItem e by-cfop.

## Problem

`preferDecimalNumber` só era usado em `stock_entry.totalValue`. Itens de
entrada NF-e e o agregado by-cfop somavam o Float legado, descartando o
sidecar.

## Roles and ownership

Inalterado. Isolamento por empresa inalterado.

## Acceptance criteria

1. **AC-082-001** — `getNfeEntryItemsByInvoice` prefere
   `unitPriceDecimal` / `totalValueGrossDecimal` / `itemDiscountDecimal` /
   `totalValueNetDecimal`.
2. **AC-082-002** — GET `/api/fiscal/by-cfop` soma `totalValueDecimal` quando
   presente.
3. **AC-082-003** — `getFinanceiroDuplicatas` continua a preferir sidecars,
   via `preferDecimalNumber` (uma implementação).

## Out of scope

T010–T013 (tax Float expand/contract, ROLE-001). Split de god files.
