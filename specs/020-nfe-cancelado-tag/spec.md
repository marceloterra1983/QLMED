---
id: SPEC-020
status: approved
owner: QLMED
related_decisions: []
affected_modules:
  - invoices-api
  - sefaz-sync
  - nsdocs-sync
  - fiscal-issued-ui
---

# Feature Specification: Tag de NF-e cancelada nas emitidas

**Feature Branch**: `feat/nfe-cancelado-tag`

**Created**: 2026-08-28

**Status**: Approved

**Input**: Identificar quando uma nota fiscal foi cancelada e mostrar
uma tag **Cancelado** ao abrir a página NF-e Emitidas.

## Problem

A lista de NF-e emitidas trata toda nota autorizada como vigente. O
cancelamento homologado na SEFAZ chega como evento separado e hoje é
descartado. O operador não distingue nota viva de nota cancelada sem
sair do QLMED.

## User scenarios and testing

### User Story 1 — Ver a tag na lista de emitidas (Priority: P1)

Como operador na página NF-e Emitidas, eu vejo a etiqueta **Cancelado**
junto da nota cuja cancelamento a SEFAZ homologou. Nota vigente não
ganha essa etiqueta.

**Why this priority**: É o pedido explícito e o valor visível.

**Independent Test**: Abrir NF-e Emitidas com uma emitida cancelada e
uma vigente. Só a cancelada mostra **Cancelado**.

**Acceptance Scenarios**:

1. **AC-001** — Given uma NF-e emitida com cancelamento homologado,
   when o operador abre NF-e Emitidas, then a linha (e o cartão no
   celular) MUST mostrar a etiqueta **Cancelado**.
2. **AC-002** — Given uma NF-e emitida vigente (autorizada, sem
   cancelamento homologado), when a lista é exibida, then a linha MUST
   NOT mostrar **Cancelado**.
3. **AC-003** — Given uma NF-e emitida que também tem etiqueta de
   operação (venda, consignação, etc.), when a lista é exibida, then
   **Cancelado** aparece além da etiqueta de operação, sem substituí-la.

### User Story 2 — Saber o cancelamento sem abrir o XML (Priority: P1)

Como o fluxo da lista, ao buscar as emitidas eu recebo se a nota está
cancelada, sem abrir o XML e sem confundir com manifestação do
destinatário (ciência, confirmação, desconhecimento).

**Independent Test**: A lista devolve, para cada item, se o
cancelamento fiscal está homologado.

**Acceptance Scenarios**:

1. **AC-004** — Given uma NF-e cujo cancelamento foi homologado, when
   a lista é lida, then o item indica cancelada.
2. **AC-005** — Given uma NF-e só com confirmação ou desconhecimento
   da operação, when a lista é lida, then o item MUST NOT indicar
   cancelada só por isso.

## Requirements

### Functional requirements

- **FR-001**: A página NF-e Emitidas MUST mostrar a etiqueta
  **Cancelado** em toda NF-e emitida com cancelamento homologado.
- **FR-002**: NF-e emitida vigente MUST permanecer sem essa etiqueta.
- **FR-003**: A decisão MUST usar evidência fiscal de cancelamento
  (evento de cancelamento aceito, situação consolidada de cancelada, ou
  situação do provedor que declare a nota cancelada), não o texto livre
  do XML autorizado original.
- **FR-004**: Manifestação do destinatário (confirmação, ciência,
  desconhecimento, operação não realizada) MUST permanecer ortogonal ao
  cancelamento. Cancelar a nota MUST NOT apagar essa manifestação.
- **FR-005**: A lista de notas MUST devolver o cancelamento de cada
  item para a página não inferir no escuro.
- **FR-006**: Evento de cancelamento MUST atualizar a nota já
  existente pela chave de acesso. MUST NOT criar uma nota nova só com
  o evento e MUST NOT substituir o XML autorizado pelo XML do evento.
- **FR-007**: Autorização é por sessão autenticada, no servidor, com
  isolamento da empresa única. Quem já vê NF-e Emitidas vê a etiqueta;
  não há papel novo.

### Failure cases

- **FAIL-001**: Evento de carta de correção ou outro evento que não
  seja cancelamento homologado — não marcar cancelada.
- **FAIL-002**: Evento de cancelamento chega e a nota ainda não existe
  — não criar nota fantasma; persistir a evidência só quando a nota da
  mesma chave existir ou passar a existir.
- **FAIL-003**: Provedor sem situação / XML sem evento — tratar como
  vigente, não inventar cancelamento.
- **FAIL-004**: Falha ao interpretar um evento — não derrubar o restante
  da sincronização; a nota vigente permanece vigente.

### Non-functional

- Sem XML completo em log.
- Migration só de expansão (campo novo anulável).
- Evidência: testes da regra de detecção e da exposição na lista.
- Página de emitidas não consulta a SEFAZ nota a nota.

### Out of scope

- Tag de cancelado em NF-e recebidas, CT-e ou NFS-e.
- Excluir canceladas dos totais do dashboard, do resumo diário ou do
  financeiro.
- Consulta de situação sob demanda (uma chamada por nota).
- Denegação, inutilização ou carta de correção.
- Novo papel ou permissão.

## Key entities

- **NF-e emitida**: documento da empresa na lista NF-e Emitidas.
- **Cancelamento homologado**: a SEFAZ registrou o evento de
  cancelamento daquela chave, ou a situação consolidada da nota é
  cancelada.
- **Manifestação**: ciência/confirmação/desconhecimento do destinatário,
  independente do cancelamento.

## Success Criteria

- **SC-001**: Operador identifica na lista, sem abrir o XML, quais
  emitidas da tela estão canceladas.
- **SC-002**: 100% dos casos de teste de cancelamento homologado
  produzem a etiqueta; 100% dos casos vigentes e de manifestação-only
  não produzem.
- **SC-003**: Abrir NF-e Emitidas continua listando as mesmas notas;
  cancelada não some da lista, só ganha etiqueta.

## Assumptions

- Cancelamento de NF-e modelo 55 é o evento de cancelamento homologado
  (e equivalentes de situação consolidada / situação do provedor).
- Resumo de evento de cancelamento na distribuição vale para marcar a
  nota se a chave existir; o XML processado do evento é a evidência
  preferida.
- Notas já gravadas sem o evento passam a exibir a tag depois da
  próxima sincronização que trouxer o evento ou a situação cancelada.
- Totais da tela (contagem e soma) continuam incluindo as canceladas.
