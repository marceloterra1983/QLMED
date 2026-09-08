---
id: SPEC-065
status: implemented
owner: QLMED
affected_modules:
  - nfe-emission
  - stock-ledger
---

# Feature Specification: Lote CD na Nova NF-e — identidade e layout

**Feature Branch**: `fix/065-nfe-emissao-lote-layout`

**Created**: 2026-09-08

**Status**: Implemented

**Input**: Follow-up de SPEC-063. Em produção, o picker de lote CD na linha do item não lista lotes e os campos ficam espremidos sob a coluna Produto.

## Problem

A emissão envia `cProd` (em geral `ProductRegistry.code`, ex. TP00971). O ledger grava `productCodigo` como `codigo || code`. O filtro `productCodigo === codigo` falha quando os dois diferem. Os três campos de lote vivem dentro do `<td>` de Produto (`sm:grid-cols-3`), desalinhados da tabela.

## Roles and ownership

- Actor: usuário autenticado com `/fiscal/issued` **ou** `/sistema/emissoes` (ACL existente de `/api/nfe-emissions`).
- Company: `getOrCreateSingleCompany`. Sem alargar acesso por query.
- Mutação: nenhuma neste follow-up (só GET + UI).

## Requirements

- **FR-001**: `GET /api/nfe-emissions/stock-lots` casa o item com saldos CD por identidade ampla: `code` **ou** `codigo` **ou** `productCodigo` (case-insensitive), usando aliases do `ProductRegistry` da company (e `productId` quando enviado).
- **FR-002**: Helper puro `filterStockLotsForProduct` / `expandStockLotProductKeys` é a única regra de match (rota não compara string crua).
- **FR-003**: Dropdown lista lotes com saldo > 0 (`lote · validade · disp.`). Sem lotes: texto **Nenhum lote no CD** (não select em branco).
- **FR-004**: Campos lote (select, editar, validade) ficam em **segunda linha** da tabela (`<tr>` + `colSpan`), alinhados em grid, não dentro da célula Produto.

## Acceptance Criteria

- **AC-001**: Teste do matcher: query `TP00971` encontra saldo cujo `productCodigo` é codigo interno distinto, via `{ code: 'TP00971', codigo: 'INT-00971' }`.
- **AC-002**: Query vazia sem aliases → lista vazia; produto diferente não entra.
- **AC-003**: `EmissionLotFields` contém `Nenhum lote no CD`; `page-client` renderiza `EmissionLotFields` numa `<tr>` com `colSpan`.
- **AC-004**: `npx tsc --noEmit` passa.

## Failure cases

- Sem `codigo` e sem `productId`: `{ lots: [] }`.
- Produto sem saldo CD: empty state, edição manual de lote permanece.
- Fetch HTTP não-OK: UI não finge que “não há lote” sem sinal — mensagem de falha de carga.
- 401: `unauthorizedResponse` (inalterado).

## Non-functional

- Sem migration. Sem log de XML fiscal.
- Lookup de registry limitado à company autenticada.

## ADRs

- Nenhum ADR novo. Reusa isolamento de company (constituição II) e ledger SPEC-056/060/063.

## Test strategy

- Vitest unitário do helper (identidades cruzadas, case, qty ≤ 0, vazio).
- Contrato de fonte: `colSpan` + empty state.
- `npx tsc --noEmit`.

## Out of scope

- Recálculo de unitário (`aggLastSalePrice` / 0.00).
- Alterar FEFO / `<rastro>` / consignação (SPEC-063).
- Picker de lote em cliente (CUSTOMER).
