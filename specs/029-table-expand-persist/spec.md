---
id: SPEC-029
status: approved
owner: QLMED
affected_modules:
  - fiscal-issued-ui
  - fiscal-received-ui
  - nfe-details-modal
---

# Feature Specification: Expand da lista fiscal sobrevive a refetch

**Feature Branch**: `fix/table-expand-persist`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Na lista de NF-e emitidas/recebidas o operador abre grupos (e, no
detalhe, linhas de produto). Enquanto navega, o estado volta a fechado.

## Problem

O fetch periódico (30s) das listas fiscais reaplica o colapso padrão porque
`loadInvoices` lê `collapsedInitialized` de um closure velho do `setInterval`.
No modal de detalhe, o expand de produto vive no estado local da aba e some
ao trocar de aba ou quando `initialTab` dispara um refetch.

## User scenarios and testing

### User Story 1 — Grupo aberto continua aberto após o refresh (Priority: P1)

Como operador, abro um mês ou “semana passada” na lista de emitidas ou
recebidas. O refresh automático da lista NÃO pode fechar o que eu abri.

**Acceptance Scenarios**:

1. **AC-001** — Given um grupo aberto pelo usuário, when a lista atualiza em
   silêncio (poll), then esse grupo MUST permanecer aberto.
2. **AC-002** — Given o primeiro carregamento sem busca, when a lista chega,
   then os grupos padrão (meses do ano corrente e semana passada) MUST
   nascer colapsados.
3. **AC-003** — Given troca de ano, when a lista recarrega, then o colapso
   padrão daquele ano MAY ser reaplicado.

### User Story 2 — Linha de produto expandida por id estável (Priority: P1)

Como operador, abro o detalhe de uma nota, expandho um produto e navego
entre abas. O produto MUST continuar aberto, identificado por número/código
— não por índice da lista.

**Acceptance Scenarios**:

1. **AC-004** — Given produtos expandidos, when a lista de itens é
   reordenada ou refeita com os mesmos ids, then os mesmos produtos MUST
   permanecer abertos.
2. **AC-005** — Given produtos expandidos, when o operador troca de aba e
   volta a Produtos, then o expand MUST persistir.

## Requirements

### Functional Requirements

- **FR-001**: Fetch periódico (`silent`) MUST NOT alterar o conjunto de
  grupos colapsados.
- **FR-002**: A identidade do expand MUST ser a chave estável do grupo
  (`hoje`, `esta_semana`, `semana_passada`, `mes_YYYY-MM`) ou da linha
  (`num:codigo` do produto), nunca o índice.
- **FR-003**: Busca digitada pelo usuário MAY expandir todos os grupos
  naquele carregamento explícito; o poll seguinte MUST preservar o que o
  usuário fez depois.
- **FR-004**: Mudar só `initialTab` no modal MUST NOT zerar os dados nem o
  expand.

## Success criteria

- Teste unitário cobre AC-001, AC-002 e AC-004.
- Emitidas e recebidas usam o mesmo helper.
