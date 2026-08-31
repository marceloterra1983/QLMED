---
id: SPEC-029
status: draft
owner: QLMED
affected_modules:
  - painel-chrome
  - page-header
---

# Feature Specification: Cabeçalho fixo das páginas do painel

**Feature Branch**: `fix/page-sticky-header`

**Created**: 2026-08-31

**Status**: Draft

**Input**: Ao rolar uma tabela longa, o operador perde o nome da tela.
O bloco de título (e as ações, se existirem) deve permanecer visível
no topo da área de conteúdo, no padrão visual de NF-e Emitidas.

## Problem

As listas do painel (fiscal, financeiro, cadastro, estoque, gestão)
têm dezenas ou centenas de linhas. O título e os botões da página
saem da viewport no scroll. O operador deixa de saber em qual tela
está sem voltar ao topo.

## Roles and ownership

- **Actor**: qualquer usuário autenticado do painel.
- **Authorization**: inalterada. Visibilidade do chrome não concede
  nem restringe permissão. Botões já condicionados a papel continuam
  no mesmo critério.
- **Company isolation**: não aplicável (sem dado novo, sem API).

## User Scenarios & Testing

### User Story 1 - Não perder o nome da tela ao rolar (Priority: P1)

O operador abre uma lista longa (ex.: NF-e Emitidas), rola a tabela
e continua vendo o nome da página (e o subtítulo, se a tela já tiver).

**Why this priority**: é o motivo do pedido — contexto operacional
durante o scroll.

**Independent Test**: abrir NF-e Emitidas, rolar até o fim da lista,
confirmar que o título permanece no topo da área de conteúdo.

**Acceptance Scenarios**:

1. **Given** a lista de NF-e Emitidas com linhas suficientes para
   scroll, **When** o operador rola o conteúdo, **Then** o bloco
   "NF-e Emitidas" permanece visível no topo da área de conteúdo,
   abaixo da navegação global (sidebar / barra mobile).
2. **Given** o tema escuro ou claro, **When** a tabela passa por baixo
   do bloco, **Then** as linhas não vazam através do fundo do
   cabeçalho (fundo opaco do token de chrome da página).
3. **Given** uma página de lista que já tinha título e subtítulo,
   **When** o chrome fixo aparece, **Then** os mesmos textos
   permanecem (sem inventar subtítulo novo).

---

### User Story 2 - Ações da página acompanham o título (Priority: P1)

Se a tela já tinha botões no cabeçalho (Nova NF-e, Exportar, olho),
eles ficam à direita do mesmo bloco fixo.

**Why this priority**: o operador usa essas ações sem voltar ao topo.

**Independent Test**: em NF-e Emitidas, rolar e acionar Exportar /
Nova NF-e sem scroll-up.

**Acceptance Scenarios**:

1. **Given** uma página com ações no cabeçalho, **When** o conteúdo
   rola, **Then** as mesmas ações permanecem no bloco fixo, à direita.
2. **Given** viewport estreita, **When** o bloco não cabe em uma
   linha, **Then** título e ações podem empilhar, sem tapar a
   navegação global.

---

### User Story 3 - Mesmo padrão nas listas do painel (Priority: P2)

As páginas de lista/tabela longa do painel usam o mesmo chrome
(título à esquerda, ações à direita). Páginas que já tinham esse
bloco apenas o alinham ao padrão fixo.

**Why this priority**: o pedido é o padrão do topo, não só NF-e.

**Independent Test**: varrer as listas (fiscal, financeiro, cadastro,
estoque, gestão) e confirmar que o primeiro bloco de título é o
chrome fixo compartilhado.

**Acceptance Scenarios**:

1. **Given** uma lista do painel que já exibia título próprio,
   **When** a tela renderiza, **Then** esse título vive no chrome
   fixo compartilhado.
2. **Given** a tela de emissão de NF-e (formulário, não lista),
   **When** esta feature entra, **Then** o fluxo de emissão e o
   campo série permanecem intocados.

### Edge Cases

- Viewport mobile: a barra `lg:hidden` do layout já mostra o nome;
  o chrome da página pode omitir o título e manter só as ações.
- Página sem ações: só o nome (e subtítulo, se existir) fica fixo.
- Tabela com `thead` sticky: o chrome da página fica acima (z-index
  maior e fundo opaco); a tabela não cobre o nome da tela.
- Ancestral com `overflow: hidden` na raiz da página: não pode
  prender o chrome — o scroll continua o da área de conteúdo.

## Requirements

### Functional Requirements

- **FR-001**: O topo da área de conteúdo do painel MUST manter
  visível o nome da página enquanto o operador rola o conteúdo.
- **FR-002**: Se a página já tinha subtítulo, o chrome MUST
  exibi-lo junto do nome.
- **FR-003**: Ações que já existiam no cabeçalho da página MUST
  permanecer no chrome, à direita.
- **FR-004**: O chrome MUST usar fundo opaco dos tokens de
  superfície do tema (claro/escuro) e z-index acima da tabela.
- **FR-005**: O chrome MUST ficar na área de conteúdo, abaixo da
  navegação global (sidebar e barra mobile). MUST NOT cobrir a nav.
- **FR-006**: Listas longas do painel (fiscal, financeiro, cadastro,
  estoque, gestão e equivalentes com título próprio) MUST usar o
  mesmo chrome compartilhado.
- **FR-007**: Em viewport estreita o chrome MUST poder empilhar
  título e ações sem quebrar o layout existente.

### Non-functional Requirements

- **NFR-001**: Sem pacote novo, sem token de design system novo.
- **NFR-002**: Reutilizar o bloco visual já usado em NF-e Emitidas
  (ícone Material Symbols Outlined + título + subtítulo + ações).
- **NFR-003**: Sem mudança de API, schema, permissão ou persistência.

### Failure cases

- Se o chrome ficar transparente, a tabela cobre o título — defeito.
- Se o chrome for `position: fixed` no viewport, tapa a sidebar ou
  a barra mobile — defeito.
- Se um wrapper `overflow: hidden` na raiz da página impedir o
  stick, o título some no scroll — defeito.

### Applicable ADRs

Nenhum ADR novo. Escolha local e reversível de chrome. Sem
persistência nem contrato de API.

### Test strategy

Contrato de fonte (vitest): o componente compartilhado declara
sticky + fundo opaco + z-index; as páginas de lista importam o
componente; o layout mantém o scroll na área de conteúdo; arquivos
de emissão/série não entram no diff.

## Success Criteria

- **SC-001**: Em NF-e Emitidas, após rolar a lista, o operador ainda
  lê o nome da tela sem voltar ao topo.
- **SC-002**: As ações que já existiam no cabeçalho de NF-e Emitidas
  continuam acionáveis com a lista rolada.
- **SC-003**: Pelo menos as listas de fiscal, financeiro, cadastro,
  estoque e gestão usam o chrome compartilhado.
- **SC-004**: `docs:validate`, typecheck, lint e `npm test` passam.
- **SC-005**: O diff não altera emissão de NF-e nem o campo série.

## Assumptions

- O scroll do painel continua no container de conteúdo do layout
  (não na janela do browser).
- Páginas de detalhe aninhadas sem título próprio ficam fora desta
  leva; recebem o chrome quando ganharem título.
- O ícone Material Symbols Outlined de cada tela permanece o que
  a tela já usava.

## Out of Scope

- Tela de emitir NF-e (`issued/nova`) e qualquer campo de série.
- Virtualização de tabela, paginação nova ou mudança de API.
- Inventar subtítulo onde a página não tinha.
- Redesenhar o design system ou trocar a biblioteca de ícones.
