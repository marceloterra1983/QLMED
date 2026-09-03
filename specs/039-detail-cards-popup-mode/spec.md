---
id: SPEC-039
status: draft
owner: QLMED
affected_modules:
  - contact-details
  - product-details
  - cadastro-ui
---

# Feature Specification: Modo Popup e Recolhimento Inicial nos Cards de Detalhes

**Feature Branch**: `feat/modal-card-popup-collapse`

**Created**: 2026-09-03

**Status**: Draft

**Input**: Ao clicar em cliente, fornecedor, produtos, etc., deve abrir com todos os cards recolhidos, e ter um botão no topo que alterne entre expandir os cards dentro do popup, ou ao selecionar para quando clicar em um card abrir este card em popup também, o modo padrão deve ser abrir em popup.

## Problem

Ao abrir o modal de detalhes de um cliente, fornecedor ou produto, seções extensas (como Dados Gerais) vinham previamente abertas por padrão. Além disso, o operador não tinha a opção de abrir cada seção/card de forma focada em uma janela/popup dedicada, tendo que navegar em um fluxo vertical extenso dentro do modal principal.

## Roles and ownership

- **Actor**: qualquer usuário autenticado com acesso às telas de cadastro (clientes, fornecedores, produtos).
- **Authorization**: inalterada. A forma de exibição visual (sanfona inline vs popup dedicado por card) não afeta regras de autorização ou mutação de dados.
- **Company isolation**: preservada pelas rotas de API existentes.

## User Scenarios & Testing

### User Story 1 - Abertura com cards recolhidos por padrão (Priority: P1)

Ao clicar em um cliente, fornecedor ou produto em qualquer listagem, o modal correspondente deve abrir com todos os cards recolhidos (fechados).

**Acceptance Scenarios**:
1. **Given** a listagem de clientes ou fornecedores, **When** o usuário clica em um contato, **Then** o modal abre com todas as seções ("Dados Gerais", "Dados de Cadastro", "Tabela de Preço", "Notas Fiscais", "Movimentações", "Duplicatas") fechadas.
2. **Given** a listagem de produtos, **When** o usuário clica em um produto, **Then** o modal abre com todas as seções ("Dados Gerais", "Dados do Cadastro", "Dados Fiscais", "Dados da ANVISA") fechadas.

### User Story 2 - Botão no topo para alternar entre Modo Popup e Modo Expandir (Priority: P1)

O topo do modal de detalhes deve possuir um controle visível e intuitivo que permita alternar entre:
1. **Abrir em popup** (Modo padrão): ao clicar no cabeçalho de qualquer card, o conteúdo do card abre em um popup/modal dedicado.
2. **Expandir no modal**: ao clicar no cabeçalho de qualquer card, ele se expande inline (acordeon) dentro do modal principal.

**Acceptance Scenarios**:
1. **Given** o modal de detalhes aberto, **When** exibido inicialmente, **Then** o modo ativo é "Abrir em popup".
2. **Given** o modo "Abrir em popup" ativo, **When** o usuário clica em um card, **Then** um modal secundário abre com o título e conteúdo exclusivo daquele card.
3. **Given** o usuário clica no botão do topo para alternar para "Expandir no modal", **When** clica em um card, **Then** o card se expande inline dentro do modal principal.
4. **Given** o popup do card aberto, **When** o usuário clica em fechar (ou ESC), **Then** o popup do card fecha e retorna à visão do modal principal sem fechar o modal principal.

## Requirements

- **REQ-001**: O estado inicial de todos os cards nos modais de cliente, fornecedor e produtos deve ser recolhido.
- **REQ-002**: Deve existir um seletor/botão de alternância no cabeçalho dos modais de detalhes que controle o modo de visualização dos cards (`popup` vs `expand`).
- **REQ-003**: O modo padrão deve ser `popup` (abrir em popup).
- **REQ-004**: No modo `popup`, o clique no card deve abrir uma janela popup com o conteúdo completo do card e botão de fechar.
- **REQ-005**: No modo `expand`, o clique no card deve expandir/recolher o card inline no modal principal.
- **REQ-006**: Testes automatizados cobrindo o estado inicial recolhido, a alternância do modo no botão do topo e a abertura dos cards.

## Acceptance Criteria

- **AC-001**: `ContactDetailsModal` inicia com `isGeneralOpen = false` e todos os outros cards fechados.
- **AC-002**: `ProductDetailModal` inicia com todos os cards fechados (sem `geral` aberto por padrão).
- **AC-003**: Botão/seletor presente no cabeçalho de `ContactDetailsModal` e `ProductDetailModal` exibindo o modo atual e permitindo a alternância.
- **AC-004**: Ao clicar em um card em modo popup, um popup com o conteúdo do card é exibido e pode ser fechado sem fechar o modal principal.
- **AC-005**: `npm run typecheck`, `npm run docs:validate` e `npm test` passam verdes.
