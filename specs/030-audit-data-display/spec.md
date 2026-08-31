---
id: SPEC-030
status: approved
owner: QLMED
affected_modules:
  - fiscal-nfse-ui
  - fiscal-list-ui
  - fiscal-dashboard
  - financeiro
---

# Feature Specification: Listas do painel sem recorte silencioso

**Feature Branch**: `fix/audit-data-display`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Auditoria 2026-08-31 — a página mostra dados reais, mas recorta
sem avisar (NFS-e emitidas na tela de recebidas, teto 2000, financeiro
escondendo vencidas, dashboard all-time, backfill de duplicata só se a
tabela estiver vazia).

## Problem

O operador vê um subconjunto e o rodapé/COUNT da API divergem, ou um filtro
implícito esconde a maior parte dos títulos.

## Requirements

- **FR-001**: `/fiscal/nfse-recebidas` MUST filtrar `type=NFSE` e
  `direction=received` na lista e nos year chips.
- **FR-002**: Listas fiscais MUST pedir `limit` igual ao máximo da API (5000),
  suficiente para o maior ano em produção (4267 emitidas em 2011).
- **FR-003**: Contas a pagar MUST NÃO descartar vencimento ≤ hoje. Status
  continua filtrável na UI.
- **FR-004**: Contas a receber MUST abrir com todos os status (não `upcoming`).
- **FR-005**: `getFinanceiroDuplicatas` MUST disparar um lote de backfill
  quando houver NF-e sem linha em `invoice_duplicata`, não só quando a
  tabela estiver vazia. Um lote por GET (não varrer 19k XML no request).
- **FR-006**: Dashboard `totalNfe` e `withTaxData` MUST ser do período
  selecionado, não all-time.

## Out of scope

Canceladas visíveis (SPEC-020). Cadastro derivado de Invoice. `stock_entry`
vazio. `REAL_STOCK` no relatório de válvulas. Paginação infinita acima de 5000.
