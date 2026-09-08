---
id: SPEC-062
status: implemented
owner: QLMED
affected_modules:
  - sistema-emissoes-ui
  - nfe-emissions-api
  - navigation
---

# Feature Specification: Página Sistema — Emissões (NF-e)

**Feature Branch**: `feat/062-sistema-emissoes-nfe`

**Created**: 2026-09-08

**Status**: Implemented

**Input**: Operador pediu rotina clara para registrar processos de emissão de NF-e e, sobretudo, o motivo de rejeição pela SEFAZ; página no grupo Sistema chamada **Emissões**, com card **Notas Fiscais**.

## Contexto

A trilha de emissão já persiste em `InvoiceEmission` (SPEC-025): status (`draft` / `submitted` / `authorized` / `rejected`), `sefazStat`, `sefazMotivo`, payload, chave e vínculo com `Invoice` quando autorizada. Faltava uma superfície operacional em **Sistema** para consultar essa trilha com ênfase em rejeições e diagnóstico.

## User Scenarios

### US-1 — Hub Emissões (P1)

Como operador, em `/sistema/emissoes` vejo cards de canais de emissão. O card **Notas Fiscais** resume contagens (total / rejeitadas / autorizadas) e leva à listagem.

### US-2 — Listagem e análise NF-e (P1)

Em `/sistema/emissoes/nfe` vejo cada emissão da empresa (mais recentes primeiro), com status, cStat, motivo SEFAZ, destinatário, CFOP, valor e data. Ao abrir o detalhe, vejo análise objetiva do motivo (texto derivado do `sefazStat` / `sefazMotivo`) sem expor XML assinado na listagem.

### US-3 — Menu e ACL (P1)

Item **Emissões** no menu Sistema; `allowedPages` inclui `/sistema/emissoes`. Subrota `/sistema/emissoes/nfe` alias da mesma página. `GET /api/nfe-emissions` acessível com `/fiscal/issued` **ou** `/sistema/emissoes`.

## Requirements

- **FR-001**: Rota `/sistema/emissoes` com `PageHeader` (título Emissões) e card clicável **Notas Fiscais**.
- **FR-002**: Rota `/sistema/emissoes/nfe` lista `InvoiceEmission` da company do usuário autenticado.
- **FR-003**: Listagem e detalhe destacam rejeições (`status=rejected`) com `sefazStat` e `sefazMotivo`.
- **FR-004**: Helper `analyzeSefazRejection` produz diagnóstico legível (ex.: 215 → falha de schema XML).
- **FR-005**: `GET /api/nfe-emissions` inclui `sefazStat`, `sefazMotivo`, `createdAt`, `accessKey` (sem `signedXml`/`protocolXml` na listagem).
- **FR-006**: Navegação: `PAGE_GROUPS`, `PAGE_LABELS`, `buildNavItems`; alias de painel; ACL da API.

## Fora de escopo

- Correção do gerador XML (med/vPMC) — bug à parte.
- Emissão de NFS-e / CT-e nesta fatia (cards futuros no hub).
- Nova tabela de eventos (reusa `InvoiceEmission`).

## Acceptance Criteria

- **AC-001**: Card Notas Fiscais em `/sistema/emissoes` aponta para `/sistema/emissoes/nfe`.
- **AC-002**: Emissão rejeitada exibe cStat + motivo + análise não vazia.
- **AC-003**: Testes de menu (SPEC-042) e de `analyzeSefazRejection` passam.
- **AC-004**: Viewer só com `/sistema/sync` não acessa `/api/nfe-emissions`; com `/sistema/emissoes` acessa.
