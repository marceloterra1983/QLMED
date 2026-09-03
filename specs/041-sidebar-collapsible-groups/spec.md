---
id: SPEC-041
status: approved
owner: QLMED
affected_modules:
  - sidebar-nav
---

# Feature Specification: Grupos do sidebar colapsáveis

**Feature Branch**: `feat/sidebar-collapsible-groups`

**Created**: 2026-09-03

**Status**: Approved

**Input**: O operador quer esconder seções do menu lateral (Cadastros, Fiscal,
Sistema, …) para enxergar só o que usa, sem perder o estado ao recarregar.

## Problem

Os títulos de seção do sidebar são texto estático. Com muitas páginas, o menu
fica longo e o operador não consegue recolher grupos.

## User scenarios and testing

### User Story 1 — Recolher e expandir seção (Priority: P1)

Como operador, clico no título da seção e os itens dessa seção somem ou
voltam. O chevron indica o estado.

**Acceptance Scenarios**:

1. **AC-001** — Given a sidebar expandida (não modo ícone), when o operador
   clica no título de uma seção com itens, then os links dessa seção MUST
   ocultar-se e o controle MUST expor `aria-expanded=false`.
2. **AC-002** — Given uma seção colapsada, when o operador clica de novo,
   then os links MUST reaparecer e `aria-expanded` MUST ser `true`.

### User Story 2 — Persistência e rota ativa (Priority: P1)

Como operador, ao recarregar a página o que eu recolhi continua recolhido,
exceto a seção da página atual, que MUST abrir para eu achar o item ativo.

**Acceptance Scenarios**:

1. **AC-003** — Given seções colapsadas, when a página recarrega, then o
   conjunto colapsado MUST restaurar do armazenamento local do browser.
2. **AC-004** — Given uma seção colapsada que contém a rota ativa, when a
   navegação aponta para essa rota, then essa seção MUST expandir.

## Requirements

### Functional Requirements

- **FR-001**: Cada `section` não nula do SidebarNav MUST ser um controle
  clicável quando a sidebar não está no modo ícone (`collapsed=false`).
- **FR-002**: A chave de identidade MUST ser o nome da seção (`Cadastros`,
  `Fiscal`, …), estável entre renders.
- **FR-003**: O estado colapsado MUST persistir em `localStorage` sob a chave
  `qlmed-sidebar-collapsed-groups` (array JSON de strings).
- **FR-004**: No modo ícone da sidebar, seções continuam só como separadores;
  não há toggle de grupo.
- **FR-005**: Mudança de `pathname` para um item dentro de seção colapsada
  MUST expandir essa seção (não reabre as outras).

## Success criteria

- Helper puro coberto por teste unitário (load/save/toggle/ensureActive).
- SidebarNav consome o helper; sem nova dependência de pacote.
