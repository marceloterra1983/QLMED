---
id: SPEC-081
status: approved
owner: QLMED
affected_modules:
  - n8n-integrations-http
  - documentos-ingest
  - unimed-cg-ingest
  - money
related:
  - SPEC-046
  - SPEC-004
  - SPEC-080
---

# Feature Specification: Superfície n8n restante e higiene da campanha de melhorias

**Feature Branch**: `feat/081-campaign-melhorias`

**Created**: 2026-09-20

**Status**: Approved

**Input**: Completar a aposentadoria HTTP do n8n (config/status), não ecoar
GATES.md leftover no `main`, recarregar Documentos após falha de rede no
Atualizar, ler sidecar Decimal no stock entry, fatiar tipos do ingest Unimed.

## Problem

SPEC-046 aposentou Automações/UI n8n mas deixou GET/PUT
`/api/integrations/n8n/*` vivos (AC-009 só preserva o webhook inbound).
`GATES.md` no `main` é leftover de outra feature. Atualizar Documentos no
`catch` de rede não recarregava a listagem (Codex P2 #472). Leitura de
`stock_entry.totalValue` ignorava o sidecar Decimal.

## Roles and ownership

- **Operador**: vê 410 nas rotas n8n de config/status se autenticado; webhook
  inbound permanece (SPEC-046 AC-009).
- **Authorization**: config/status continuam a exigir sessão (viewer/admin)
  antes do 410. Webhook inalterado.
- **Company isolation**: inalterada.

## Acceptance criteria

1. **AC-081-001** — GET `/api/integrations/n8n/status` autenticado MUST 410.
2. **AC-081-002** — GET/PUT `/api/integrations/n8n/config` autenticado MUST 410
   e MUST NÃO cifrar/decifrar token.
3. **AC-081-003** — POST `/api/webhooks/n8n` permanece.
4. **AC-081-004** — `GATES.md` NÃO está versionado na raiz.
5. **AC-081-005** — Atualizar Documentos recarrega GET `/api/documentos` no
   `catch` de rede.
6. **AC-081-006** — `mapStockEntry` prefere `totalValueDecimal`.

## Out of scope

- Contract (DROP) das colunas Float (SPEC-004 T010–T013 + ROLE-001).
- Fatiar o corpo de `runUnimedCgIngest` / `issued/page-client.tsx` além dos
  tipos/ports e helpers de tag.
- Alterar tetos `ponytail:` (NSU, duplicatas 500, botão 28px).
