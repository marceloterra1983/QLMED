---
id: SPEC-053
status: approved
owner: QLMED
affected_modules:
  - fiscal-issued-ui
  - fiscal-received-ui
  - fiscal-cte-ui
  - fiscal-nfse-ui
  - estoque-entrada-nfe-ui
  - financeiro-ui
  - cadastro-contatos-ui
---

# Feature Specification: Divisórias relativas estáticas nas listas por data

**Feature Branch**: `feat/remove-semana-dividers`

**Created**: 2026-09-06

**Status**: Approved (amended)

**Input**: Remover permanentemente as divisorias de lista **"Esta semana"** e
**"Semana passada"** (e o mesmo padrão **"Próxima semana"**). Manter **Hoje**
como única divisória relativa estática. Itens que estavam nessas semanas
permanecem na UI sob o grupo do **mês** calendário.

## Problem

As divisorias de semana relativa fragmentavam a lista sem ganho operacional.
O operador já tem o mês atual no topo e Hoje; as semanas só geravam ruído.

## User Scenarios & Testing

### User Story 1 — Sem divisorias de semana (Priority: P1)

Como operador, não vejo "Esta semana", "Semana passada" nem "Próxima semana"
nas listas por data. Itens daqueles períodos aparecem sob o mês (e Hoje, se
for o dia corrente).

**Why this priority**: pedido explícito de remoção permanente.

**Independent Test**: Abrir emitidas/recebidas/CT-e/NFS-e/entrada/financeiro
com notas recentes; buscar no DOM/texto as labels de semana — ausentes; notas
ainda listadas.

**Acceptance Scenarios**:

1. **AC-001** — Given uma lista agrupada por data, when o grupo é `Hoje`
   (chave `hoje`), then o cabeçalho MUST ser uma divisória estática: sem
   ícone de expandir e sem toggle.
2. **AC-002** — Given notas de "esta semana" / "semana passada" (exceto
   hoje), when a lista renderiza, then MUST NÃO existir cabeçalho
   `Esta semana` / `Semana passada` / `Próxima semana` (nem chaves
   `esta_semana` / `semana_passada`). Os itens MUST aparecer sob o mês
   calendário correspondente (`mes_YYYY-MM` / rótulo mês/ano / `Este mês` /
   `Mês passado` via `getDateGroupLabel`).
3. **AC-003** — Given um grupo de mês (`mes_YYYY-MM`, `Este mês`,
   `Mês passado` ou rótulo `mês/ano`), when o operador clica no cabeçalho,
   then os itens MUST ocultar-se e o chevron MUST indicar colapsado.
4. **AC-006** — Given notas no mês calendário atual, when a lista abre no
   recorte corrente, then o primeiro cabeçalho MUST ser o mês atual
   (`mes_YYYY-MM`), colapsável, acima de Hoje (se houver). Recolher esse mês
   MUST ocultar Hoje e o restante do mês. O mês atual MUST nascer expandido;
   os demais meses MUST nascer colapsados. Recolher (botão) MUST incluir a
   chave do mês atual.

### User Story 2 — Mesma regra em todas as listas (Priority: P1)

Como operador, a regra é a mesma em emitidas, recebidas, CT-e, NFS-e,
entrada de NF-e, financeiro e cadastro de contatos (quando o agrupamento
é por data). Agrupamento que não é por data (cidade, linha de produto)
continua colapsável.

**Independent Test**: Cada lista usa o mesmo helper/componente.

**Acceptance Scenarios**:

1. **AC-004** — Given as listas acima, when o agrupamento é por data,
   then a regra de AC-001/AC-003 MUST valer em desktop e mobile.
2. **AC-005** — Given cadastro de contatos ordenado por cidade, when o
   grupo é o nome da cidade, then o cabeçalho MUST continuar colapsável.

## Requirements

### Functional Requirements

- **FR-001**: A decisão “este grupo é colapsável?” MUST viver num helper
  puro único (`isCollapsibleDateGroup`), consumido por todas as listas
  citadas.
- **FR-002**: Único bucket relativo estático: `Hoje` / `hoje`. Divisorias
  de semana (`Esta semana`, `Semana passada`, `Próxima semana` e chaves
  `esta_semana` / `semana_passada`) foram **removidas permanentemente** e
  MUST NÃO ser renderizadas.
- **FR-003**: Meses MUST permanecer colapsáveis. O colapso padrão do
  primeiro load (SPEC-029) MUST aplicar-se só a meses.
- **FR-004**: O cabeçalho visual MUST ser um componente compartilhado,
  para as listas não divergirem.
- **FR-005**: Recolher/Expandir MUST afetar só grupos colapsáveis.
- **FR-006**: O mês calendário atual MUST aparecer no topo como grupo
  colapsável (`mes_YYYY-MM`) sempre que houver item nesse mês. Hoje (se
  houver) fica dentro desse grupo. O load padrão MUST deixar o mês atual
  expandido.
- **FR-007**: `getDateGroupLabel` MUST NÃO retornar `Esta semana`,
  `Semana passada` nem `Próxima semana`; datas nessas janelas usam o
  rótulo de mês (`Este mês` / `Mês passado` / mês longo).
- **FR-008**: Fora de escopo: o card KPI Financeiro **"Esta Semana"**
  (métrica de resumo, não divisória de lista) permanece.

## Success criteria

- Helper puro coberto por teste unitário (Hoje vs mês vs cidade).
- Componente de cabeçalho coberto por teste (chevron ausente em Hoje,
  presente em mês; clique só no mês).
- Testes de `getDateGroupLabel` / `buildNfeGroups` / walker sem expectativas
  de labels de semana.
- SPEC-029 alinhado: colapso padrão = meses; Hoje visível; semanas removidas.
