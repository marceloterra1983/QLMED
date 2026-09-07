---
id: SPEC-057
status: draft
owner: QLMED
affected_modules:
  - estoque
  - navigation
  - nfe-emission
  - stock-ledger
---

# Feature Specification: Saída Material

**Feature Branch**: `feat/057-saida-material`

**Created**: 2026-09-07

**Status**: Draft

**Input**: Página "Saída Material" no grupo Estoque para montar carrinho de saída (consignado, avulsa, venda direta, material usado), emitir NF-e ou gerar checklist de saída, com saldos do CD ou consignados por cliente.

## Problem

Controle e Entrada NF-e existem, mas não há fluxo operacional unificado para escolher produtos em estoque, destinatário e destino (NF-e vs checklist) com CFOPs padrão por tipo de saída.

## Roles and ownership

- **Actor**: usuário autenticado com página `/estoque/saida-material` em `allowedPages` (ou admin). A página compartilha o prefixo `/api/estoque` com Controle e Entrada NF-e.
- **Mutação** (checklist / SAIDA_AVULSA / emitir rascunho NF-e): exige editor/admin (`requireEditor` nas rotas de escrita).
- **Company isolation**: `companyId` via `getOrCreateSingleCompany`; nunca do body.

## User Scenarios & Testing

### US1 — Consignado / Venda Direta a partir do CD (P1)

**Given** saldos CD com qty>0, **When** abre as abas Consignado ou Venda Direta, **Then** vê catálogo agrupado por tipo/subtipo; cliente obrigatório; ao Continuar escolhe Emitir NF-e ou Check List.

### US2 — Saída Avulsa (P1)

**Given** saldos CD, **When** aba Saída Avulsa, **Then** cliente opcional; Emitir NF-e oculto/desabilitado; checklist é primário; opcional registrar movimento `SAIDA_AVULSA` OUT do CD.

### US3 — Material Usado (consignado no cliente) (P1)

**Given** saldos `CUSTOMER` para um CNPJ, **When** seleciona o cliente, **Then** vê apenas saldos consignados daquele cliente; CFOP padrão 5114 na emissão.

### US4 — Destino após carrinho (P1)

**Given** itens selecionados, **When** Continuar, **Then** modal (não `window.confirm`) com resumo e botões Emitir NF-e | Check List | Cancelar.

### US5 — Checklist append-only (P1)

**Given** editor, **When** confirma checklist, **Then** grava `StockExitChecklist` e abre modal imprimível (`window.print` CSS).

## Requirements

- **REQ-001**: Menu Estoque na ordem **Entrada NF-e**, **Controle**, **Saída Material** (`/estoque/saida-material`) em `PAGE_GROUPS`, `SidebarNav` (`PAGE_LABELS` + `buildNavItems`) e `API_PREFIX_TO_PAGES` inclui a página em `/api/estoque`.
- **REQ-002**: Quatro abas: Consignado | Saída Avulsa | Venda Direta | Registro Material Usado.
- **REQ-003**: Consignado / Avulsa / Venda Direta listam só CD (qty>0), agrupados por `productType`/`productSubtype` (enrichment ProductRegistry).
- **REQ-004**: Material Usado: cliente primeiro; saldos `locationType=CUSTOMER` filtrados por CNPJ.
- **REQ-005**: Cliente obrigatório no topo para Consignado, Venda Direta e Material Usado; opcional (popup) em Saída Avulsa.
- **REQ-006**: Operador escolhe lotes dos saldos; FEFO apenas como ordem de listagem.
- **REQ-007**: CFOP default: Consignado→5917; Venda Direta→5102; Material Usado→5114; Saída Avulsa→sem NF por padrão.
- **REQ-008**: Checklist **não** baixa estoque automaticamente, exceto quando Saída Avulsa marca registro de movimento `SAIDA_AVULSA` OUT do CD.
- **REQ-009**: Persistência Prisma `StockExitChecklist` (kinds `CHECKLIST` | `SAIDA_AVULSA`); migration pinada no portão de produção.
- **REQ-010**: Emitir NF-e cria rascunho via `POST /api/nfe-emissions` e navega para `/fiscal/issued/nova?emissionId=…` (página carrega o rascunho).
- **REQ-011**: Fora de escopo v1: multi-depósito, FEFO obrigatório, scanner UDI, edição/cancelamento de checklist, emissão SEFAZ automática sem revisão.

## Acceptance Criteria

- **AC-001**: Nav e ACL expõem `/estoque/saida-material` na ordem correta.
- **AC-002**: APIs `GET …/saldos`, `GET …/clientes`, `POST …/checklist` sob `/api/estoque/saida-material/`.
- **AC-003**: UI com PageHeader, abas, carrinho sticky, Modal de destino e checklist imprimível; sem `alert`/`confirm` nativos.
- **AC-004**: Testes unitários (CFOP por aba, clamp de qty, agrupamento); pin de migration; `tsc`, `ui:dialogs`, `docs:validate`.
- **AC-005**: Preview `:3002` responde 200/302/307 em `/estoque/saida-material`.

## Out of scope

Multi-filial, bloqueio hard de vencido, FEFO obrigatório, inventário cíclico, impressão térmica dedicada, WhatsApp de checklist.
