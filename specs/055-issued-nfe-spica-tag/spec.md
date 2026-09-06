---
id: SPEC-055
status: active
owner: QLMED
affected_modules:
  - nfe-item-link
  - fiscal-issued
  - invoice-ingest
depends_on:
  - SPEC-047
---

# Feature Specification: Tag Spica nos produtos das NF-e emitidas

**Feature Branch**: `feat/055-issued-spica-tag`
**Created**: 2026-09-06
**Status**: Active
**Spec Kit**: 055

## Problem

SPEC-047 vincula e marca Cód. Spica só em NF-e **recebidas**. Em emitidas o
`cProd` já é o código Spica do cadastro, mas a aba Produtos não mostra a tag
nem grava `nfe_item_product_link` — o operador não confirma visualmente que
todo item está relacionado a um produto cadastrado.

## Goals

1. Persistir vínculo item emitido → `product_registry` (mesma tabela/cascata).
2. Anexar `vinculo` no detalhe da nota emitida.
3. Mostrar tag verde com `matchedCodigo` (ou âmbar “Sem vínculo”) na aba Produtos.
4. Varredura e ingest cobrem `direction=issued`.

## Non-Goals

- Mudar cascata S1–S6 (S1 cobre ~100% dos cProd emitidos medidos).
- Alterar DANFE/PDF.
- Nova UI de pendências só para emitidas (pendências usam a página existente).

## Functional Requirements

- **FR-001**: `runInvoiceIngestPipeline` chama `linkInvoiceItems` para NFE
  `received` **e** `issued`.
- **FR-002**: `runNfeItemLinkSweep` varre NFE com
  `direction in ('received','issued')` (ou filtro explícito).
- **FR-003**: `GET /api/invoices/[id]/details` anexa `vinculo`/`linkId` também
  quando `direction=issued`.
- **FR-004**: `TabProdutos` exibe coluna/tag Spica para emitidas e recebidas.

## Success Criteria

- Após sweep de emitidas: ≥99% dos itens com `productRegistryId` (baseline
  medido: 1973/1973 cProd distintos = `product_registry.codigo`).
- Aba Produtos de emitida mostra badge mono emerald com o código Spica.
