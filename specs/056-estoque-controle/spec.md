---
id: SPEC-056
status: draft
owner: QLMED
affected_modules:
  - estoque
  - navigation
  - nfe-emission
  - stock-entry
---

# Feature Specification: Controle de Estoque (saldos, lotes, consignação)

**Feature Branch**: `feat/056-estoque-controle`

**Created**: 2026-09-07

**Status**: Draft

**Input**: Página "Controle" no grupo Estoque para visualizar/rastrear produtos por lote e validade; entradas via NF-e de entrada; saídas via NF-e emitida ou movimento avulso; saldo próprio (CD) e consignado por cliente; alertas de validade; perda por validade e ajuste.

## Problem

Hoje só existe Entrada NF-e com lotes em `nfe_entry_item`. Não há ledger de movimentos, saldo por localização, baixa na emissão, consignação como estoque no cliente, nem tela para validade/perda/ajuste.

## Roles and ownership

- **Actor**: usuário autenticado com página `/estoque/controle` em `allowedPages` (ou admin).
- **Mutação** (ajuste/perda/backfill): exige papel editor/admin (`requireEditor`).
- **Company isolation**: `companyId` via `getOrCreateSingleCompany` / auth helpers; nunca do body.

## User Scenarios & Testing

### US1 — Ver saldos por produto/lote/local (P1)

**Given** movimentos no ledger, **When** abre `/estoque/controle`, **Then** vê saldos CD e consignado por cliente (CNPJ), com faixa de validade (vencido / ≤30 / ≤90 / OK).

### US2 — Kardex / movimentos (P1)

**Given** um produto ou lote, **When** filtra movimentos, **Then** vê linha do tempo com tipo, qty, local, documento e motivo.

### US3 — Baixa automática na NF-e emitida (P1)

**Given** NF-e autorizada, **When** finalizeAuthorized persiste a nota, **Then** movimentos de saída/remessa/retorno são gravados (idempotentes).

### US4 — Entrada gera movimento no CD (P1)

**Given** registro de entrada NF-e, **When** itens com lote são persistidos, **Then** movimentos `ENTRADA_NFE` no CD existem (idempotentes por item).

### US5 — Perda por validade e ajuste (P1)

**Given** editor, **When** registra perda/ajuste com motivo e lote, **Then** movimento avulso altera o saldo na localização indicada.

### US6 — Backfill + correção (P1)

**Given** histórico fiscal, **When** backfill roda, **Then** movimentos derivados de entradas registradas e NF-e emitidas; ajustes manuais corrigem divergências.

## Requirements

- **REQ-001**: Menu Estoque inclui **Controle** → `/estoque/controle`; ACL e `API_PREFIX_TO_PAGES` cobrem `/api/estoque/controle`.
- **REQ-002**: Ledger append-only `stock_movement` (Prisma migration); saldo derivado por produto+lote+validade+localização.
- **REQ-003**: Localização: `CD` ou `CUSTOMER:{cnpj}` (consignado).
- **REQ-004**: Tipos: `ENTRADA_NFE`, `SAIDA_NFE`, `REMESSA_CONSIG`, `RETORNO_CONSIG`, `PERDA_VALIDADE`, `AJUSTE`.
- **REQ-005**: Operador escolhe lote na avulsa; FEFO só ordena/alerta na UI.
- **REQ-006**: Alertas: vencido, ≤30d, ≤90d, OK — sem bloqueio de saída.
- **REQ-007**: Remessa (CFOP tag Consignação 5917/6917): OUT CD + IN CUSTOMER; retorno (1918/2918 etc.): inverso; venda: OUT na localização adequada (CD ou cliente se venda de consignado 5114/6114).
- **REQ-008**: Idempotência por `idempotencyKey` única.
- **REQ-009**: Backfill reprocessável sem duplicar.
- **REQ-010**: Fora de escopo v1: multi-depósito, bloqueio de vencido, FEFO obrigatório, UDI/scanner, quarentena formal.

## Acceptance Criteria

- **AC-001**: Página Controle listável no nav e acessível com permissão.
- **AC-002**: API GET saldos e movimentos; POST ajuste/perda; POST backfill (editor).
- **AC-003**: Testes unitários do ledger (consignação, ajuste, validade band, idempotência).
- **AC-004**: `npx tsc --noEmit`, `npm run docs:validate`, testes relevantes verdes.
- **AC-005**: Migration pinada em `verify-production-migration-window.cjs`.

## Out of scope

Multi-filial, bloqueio hard de vencido, FEFO obrigatório, serialização UDI, inventário cíclico completo.
