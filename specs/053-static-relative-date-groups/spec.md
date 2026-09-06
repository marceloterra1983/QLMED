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

**Feature Branch**: `fix/static-relative-date-groups`

**Created**: 2026-09-06

**Status**: Approved

**Input**: Na navegação das tabelas, Hoje, Esta semana e Semana passada são
divisorias colapsáveis. Deixar só os meses colapsáveis; os três buckets
relativos viram linhas divisorias. Aplicar em todas as tabelas com essa divisão.

## Problem

Os buckets relativos (Hoje, Esta semana, Semana passada) ocupam o mesmo
controle colapsável dos meses. O operador precisa clicar para ver o que
acabou de acontecer, e o chevron sugere que aqueles períodos são arquivo.

## User Scenarios & Testing

### User Story 1 — Relativos sempre visíveis (Priority: P1)

Como operador, vejo Hoje, Esta semana e Semana passada como linhas
divisorias. Não há chevron nem clique. Os itens dessas seções permanecem
visíveis.

**Why this priority**: é o defeito de UX pedido.

**Independent Test**: Abrir uma lista fiscal com os três buckets e um mês;
só o mês recolhe.

**Acceptance Scenarios**:

1. **AC-001** — Given uma lista agrupada por data, when o grupo é `Hoje`,
   `Esta semana` ou `Semana passada` (ou as chaves `hoje` / `esta_semana` /
   `semana_passada`), then o cabeçalho MUST ser uma divisória estática:
   sem ícone de expandir e sem toggle.
2. **AC-002** — Given esses grupos relativos, when o operador clica em
   Recolher, then os itens relativos MUST continuar visíveis.
3. **AC-003** — Given um grupo de mês (`mes_YYYY-MM`, `Este mês`,
   `Mês passado` ou rótulo `mês/ano`), when o operador clica no cabeçalho,
   then os itens MUST ocultar-se e o chevron MUST indicar colapsado.
4. **AC-006** — Given notas no mês calendário atual, when a lista abre no
   recorte corrente, then o primeiro cabeçalho MUST ser o mês atual
   (`mes_YYYY-MM`, ex. `Setembro/2026`), colapsável, acima de Hoje / Esta
   semana. Recolher esse mês MUST ocultar Hoje, Esta semana e o restante
   do mês. Dias da semana corrente que caem no mês anterior MUST ficar
   fora desse shell. O mês atual MUST nascer expandido; os demais meses
   MUST nascer colapsados. Recolher (botão) MUST incluir a chave do mês
   atual.

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
- **FR-002**: Buckets relativos (`Hoje`, `Esta semana`, `Semana passada`,
  `Próxima semana` e as chaves `hoje` / `esta_semana` / `semana_passada`)
  MUST NÃO ser colapsáveis.
- **FR-003**: Meses MUST permanecer colapsáveis. O colapso padrão do
  primeiro load (SPEC-029) MUST aplicar-se só a meses, nunca a
  `semana_passada`.
- **FR-004**: O cabeçalho visual MUST ser um componente compartilhado,
  para as listas não divergirem.
- **FR-005**: Recolher/Expandir MUST afetar só grupos colapsáveis.
- **FR-006**: O mês calendário atual MUST aparecer no topo como grupo
  colapsável (`mes_YYYY-MM`) sempre que houver item nesse mês. Os buckets
  relativos do mês atual ficam dentro desse grupo. O load padrão MUST
  deixar o mês atual expandido.

## Success criteria

- Helper puro coberto por teste unitário (relativos vs mês vs cidade).
- Componente de cabeçalho coberto por teste (chevron ausente em Hoje,
  presente em mês; clique só no mês).
- SPEC-029 AC-002 alinhado: colapso padrão = meses, não semana passada.
