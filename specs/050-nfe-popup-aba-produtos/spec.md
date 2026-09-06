---
id: SPEC-050
status: draft
owner: QLMED
affected_modules:
  - nfe-details-modal
  - fiscal-invoices-ui
  - fiscal-issued-ui
---

# Feature Specification: Popup de NF-e abre na aba Produtos

**Feature Branch**: `fix/nfe-popup-aba-produtos`

**Created**: 2026-09-05

**Status**: Draft

**Input**: Ao clicar na linha das NF-e recebidas ou emitidas, o popup deve sempre abrir na aba Produtos.

## Problem

O clique na linha das listagens de NF-e recebidas (`/fiscal/invoices`) e emitidas (`/fiscal/issued`) abre `NfeDetailsModal` via `openDetails`, que não fixava aba e o modal caía no default `nfe`. O operador precisa ver os itens imediatamente.

## Roles and ownership

- **Actor**: qualquer usuário autenticado com acesso às listagens fiscais de NF-e.
- **Authorization**: inalterada.
- **Company isolation**: preservada pelas rotas de API existentes.

## User Scenarios & Testing

### User Story 1 - Clique na linha abre Produtos (Priority: P1)

**Acceptance Scenarios**:

1. **Given** a listagem de NF-e recebidas, **When** o operador clica na linha de uma nota, **Then** o popup abre com a aba Produtos selecionada (`aria-selected="true"`).
2. **Given** a listagem de NF-e emitidas, **When** o operador clica na linha de uma nota, **Then** o popup abre com a aba Produtos selecionada.
3. **Given** o modal aberto sem `initialTab` explícito, **When** ele monta, **Then** a aba ativa é `produtos`.

### Edge Cases

- `initialTab` explícito (ex.: ação dedicada) continua a prevalecer sobre o default.
- Fechar e reabrir outra nota reinicia na aba Produtos (não reutiliza a última aba visitada).

## Requirements

- **REQ-001**: `NfeDetailsModal` usa default `produtos` quando `initialTab` está ausente.
- **REQ-002**: `openDetails` nas páginas de recebidas e emitidas passa `initialTab='produtos'`.
- **REQ-003**: Teste automatizado da faixa de abas exige que a aba selecionada seja Produtos.

## Acceptance Criteria

- **AC-001**: Clique na linha (recebidas e emitidas) abre na aba Produtos.
- **AC-002**: `npx vitest run src/components/__tests__/NfeDetailsModal.tabs.test.tsx` passa.
- **AC-003**: `npm run docs:validate` passa.

## Out of scope

- Alterar ordem das abas, conteúdo da aba Produtos ou o modal DANFE/XML (`InvoiceDetailsModal`).
- Mudar comportamento de outras entradas que passem `initialTab` diferente de `produtos`.
