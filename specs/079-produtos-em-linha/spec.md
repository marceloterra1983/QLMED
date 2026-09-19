---
id: SPEC-079
status: approved
owner: QLMED
affected_modules:
  - produtos-ui
related:
  - SPEC-043
---

# Feature Specification: Produtos abrem com Status Em Linha

**Feature Branch**: `feat/079-produtos-em-linha`

**Created**: 2026-09-19

**Status**: Approved

**Input**: Ao carregar Cadastro → Produtos, o filtro Status deve vir
selecionado em **Em Linha**. O operador ainda pode escolher Todos ou Fora
de Linha. Pedido junto: ver se a lista ainda pode ficar mais rápida.

## Problem

O default atual é `Todos` (`lineStatus=all`), então a primeira carga mistura
produtos fora de linha no catálogo operacional. O contrato de 2026-09
explicitava esse default (Spica). O uso diário é o estoque em linha.

Na visão hierárquica a UI ainda pedia `lineStatus=all` ao servidor mesmo
com o botão Em Linha — baixava o catálogo inteiro e filtrava no cliente.
Isso pesa o primeiro paint.

## Roles and ownership

- **Operador**: vê a lista; precisa da página em `allowedPages` (ou admin).
- **Mutação**: nenhuma. Só default de filtro de leitura.
- **Authorization / isolamento**: inalterados.

## User Scenarios & Testing

### User Story 1 — Abrir produtos já em linha (Priority: P1)

Como operador, abro Produtos e o status **Em Linha** já está pressionado.
Não vejo fora de linha até escolher Todos ou Fora de Linha.

**Why this priority**: é o pedido.

**Independent Test**: estado inicial `lineStatusFilter === 'active'`; o
botão Em Linha tem `aria-pressed`.

**Acceptance Scenarios**:

1. **AC-079-001** — Given a tela de produtos recém-aberta, when o filtro
   Status renderiza, then Em Linha MUST estar selecionado e Todos MUST NOT.
2. **AC-079-002** — Given o default Em Linha, when o operador clica Todos
   ou Fora de Linha, then o filtro MUST mudar e a lista MUST refletir.

### User Story 2 — Árvore não explode no default (Priority: P1)

Como operador, a hierarquia Linha/Grupo continua recolhida na abertura.
O default Em Linha NÃO conta como “filtro ativo” que abre todos os grupos.

**Why this priority**: tratar `active` como filtro ativo hoje chama
`setCollapsedGroups(new Set())` e renderiza o catálogo aberto — piora
a velocidade.

**Independent Test**: `treeFilterActive` no default (só status active)
é falso.

**Acceptance Scenarios**:

1. **AC-079-003** — Given sort por Linha e status Em Linha, when a lista
   carrega sem busca/linha/grupo, then os grupos MUST permanecer
   recolhidos (mesmo contrato `allCollapseKeys`).

## Requirements

- **FR-079-01**: O estado inicial de `lineStatusFilter` MUST ser `active`.
- **FR-079-02**: A visão hierárquica MUST enviar `lineStatus` do filtro
  ao servidor (não forçar `all`).
- **FR-079-03**: `treeFilterActive` MUST ignorar o default Em Linha; busca
  e filtros de linha/grupo/subgrupo continuam expandindo.
- **FR-079-04**: A API `GET /api/products/list` MAY continuar default
  `all` para outros consumidores.

## Failure cases

- Sem sessão: 401 inalterado.
- Usuário troca para Todos: vê também fora de linha.
- Árvore + Em Linha: payload menor; hierarquia de linhas só com produtos
  em linha.

## Non-functional

- Sem migration. Sem pacote novo. Sem mock de auth.
- Abrir Produtos deve transferir menos linhas do que o catálogo Spica
  completo quando o default Em Linha está ativo.

## Out of scope

- bcrypt nativo, dual Evolution, `shared_buffers`, worker OCR fora do Next.
- Mudar o default da API para `active`.
- Persistência do filtro no localStorage.

## Assumptions

- “Em Linha” = `lineStatus=active` (já existente).
- Sort default continua `productType` (árvore).

## Success criteria

- **SC-079-01**: Contrato Vitest deixa de exigir default `'all'` na UI.
- **SC-079-02**: Preview `:3002` mostra Em Linha pressionado ao abrir
  `/cadastro/produtos`.

## Test strategy

- Atualizar `produtos-groups-expanded-contract.test.ts`.
- Teste de fonte: `page-client` usa `'active'` e não força
  `serverLineStatus` tree=`all`.
