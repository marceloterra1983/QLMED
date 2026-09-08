---
id: SPEC-063
status: implemented
owner: QLMED
affected_modules:
  - nfe-emission
  - stock-ledger
  - saida-material
---

# Feature Specification: Lotes de estoque na emissão de NF-e

**Feature Branch**: `feat/063-nfe-emissao-lotes-estoque`

**Created**: 2026-09-08

**Status**: Implemented

**Input**: Na emissão de NF-e deve ser possível selecionar e editar lotes do estoque; a emissão faz parte do controle de estoque; consignação registra e dá baixa.

## Problem

A autorização já chama `recordMovementsFromIssuedInvoice`, mas o XML gerado não traz `<rastro>`. Sem lote no XML o ledger aloca FEFO e a escolha do operador é ignorada.

## Roles and ownership

- Actor: usuário com `/fiscal/issued` ou `/estoque/saida-material`.
- Mutação: `requireEditor`. Company via `getOrCreateSingleCompany`.

## Requirements

- **REQ-001**: Item do payload aceita `lot`, `lotExpiry`, `lotFab` opcionais.
- **REQ-002**: XML inclui `<rastro>` (nLote, qLote, dFab, dVal) quando o item tem lote e datas válidas.
- **REQ-003**: Tela `/fiscal/issued/nova` lista lotes CD com saldo > 0 e permite selecionar/editar lote e validade.
- **REQ-004**: Saída Material, ao criar rascunho, envia lote/validade do carrinho.
- **REQ-005**: Consignação (5917/6917) exige lote em cada item na autorização; após autorizar, `REMESSA_CONSIG` debita CD e credita CUSTOMER no lote escolhido.
- **REQ-006**: Sem lote no XML, `preferredLots` do payload prevalece sobre FEFO.

## Acceptance Criteria

- **AC-001**: Teste do builder contém `<rastro>` com nLote/qLote/dFab/dVal.
- **AC-002**: Sem lote, XML não contém `<rastro>`.
- **AC-003**: `resolveIssuedItemBatches` usa lote preferido antes de FEFO.
- **AC-004**: `assertConsignacaoLots` falha se 5917 sem lote.
- **AC-005**: `emitNfe` da Saída Material inclui `lot` e `lotExpiry`.
