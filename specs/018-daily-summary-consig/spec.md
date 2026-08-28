---
id: SPEC-018
status: approved
owner: QLMED
related_decisions: [ADR-0010]
affected_modules:
  - invoices-api
  - n8n-daily-summary
---

> **Cabeçalho supersedido.** AC-003, FR-004 e SC-003 (contagem e total de
> **todas** as emitidas) foram substituídos pela [SPEC-021](../021-daily-summary-venda-total/spec.md).
> O sufixo `(CONSIG.)` por linha permanece.

# Feature Specification: Marca de consignação no resumo do dia

**Feature Branch**: `feat/daily-summary-consig`

**Created**: 2026-08-27

**Status**: Approved

**Input**: No WhatsApp do resumo diário de NF-e emitidas, quando a nota não
for de venda, o valor deve aparecer com `(CONSIG.)` entre parênteses.

## Problem

O resumo das 18h lista número, destinatário e valor. Notas que não são venda
(devolução de consignação, remessa, uso externo do ativo) entram na mesma
lista e parecem faturamento. Quem lê o grupo precisa ver, na linha, que
aquele valor não é venda.

## User scenarios and testing

### User Story 1 — Distinguir venda de não-venda no grupo (Priority: P1)

Como operador no grupo WhatsApp, no resumo do dia eu vejo `(CONSIG.)`
depois do valor só nas notas que não são venda. Venda fica só com o valor.

**Independent Test**: Montar a linha da nota 65160 (devolução de
consignação, R$ 5.890,85) e da 65159 (venda, R$ 4.800,00). A primeira
termina com `(CONSIG.)`; a segunda não.

**Acceptance Scenarios**:

1. **AC-001** — Given uma NF-e emitida classificada como venda, when o
   resumo do dia é montado, then a linha termina no valor em reais e MUST
   NOT conter `(CONSIG.)`.
2. **AC-002** — Given uma NF-e emitida que não é venda (devolução de
   consignação ou outra operação que não venda), when o resumo é montado,
   then o valor é seguido de ` (CONSIG.)`.
3. **AC-003** — *(supersedido pela SPEC-021)* Given o cabeçalho do
   resumo, when a mensagem é montada, then a contagem e o valor passam
   a ser só das vendas; a linha individual de não-venda continua com o
   sufixo. Registro histórico: a 018 pedia incluir todas as emitidas.

### User Story 2 — Lista do app expõe a classificação (Priority: P1)

Como o fluxo do resumo, ao buscar as emitidas do dia eu recebo a
classificação fiscal da nota (venda ou não) junto com o valor, sem abrir o
XML.

**Independent Test**: A lista de notas devolve, para cada item, a etiqueta
da operação usada para decidir o sufixo.

**Acceptance Scenarios**:

1. **AC-004** — Given uma nota com CFOP de venda, when a lista é lida,
   then a etiqueta da operação é venda.
2. **AC-005** — Given uma nota com CFOP que não é venda, when a lista é
   lida, then a etiqueta não é venda e o resumo aplica `(CONSIG.)`.

## Requirements

### Functional requirements

- **FR-001**: Cada linha do resumo diário de emitidas MUST mostrar
  `(CONSIG.)` imediatamente após o valor quando a nota não for venda.
- **FR-002**: Linha de venda MUST permanecer `número · destinatário · valor`,
  sem o sufixo.
- **FR-003**: A decisão venda / não-venda MUST usar a classificação fiscal
  já existente da nota (primeiro CFOP persistido), não o nome do cliente.
- **FR-004**: *(supersedido pela SPEC-021)* Contagem e valor total do
  cabeçalho MUST somar somente as notas de venda.
- **FR-005**: A lista de notas MUST devolver a etiqueta da operação para
  cada item, para o resumo não reclassificar no escuro.

### Failure cases

- **FAIL-001**: CFOP ausente ou desconhecido — tratar como não-venda e
  mostrar `(CONSIG.)` (não inventar venda).
- **FAIL-002**: Dia sem emitidas — mensagem vazia atual, sem sufixo.

### Non-functional

- Sem migration.
- Sem XML no log nem no resumo.
- Evidência: testes da regra de sufixo e da etiqueta na lista.

### Out of scope

- Relabelar a tela `/fiscal/issued`.
- Reenviar o resumo já entregue hoje.
- Mudar destinatário do grupo (SPEC-015).
- Dois totais no cabeçalho (venda e consignação): a SPEC-021 substitui
  o cabeçalho por um único total de venda.

## Key entities

- **Resumo do dia**: mensagem WhatsApp das NF-e emitidas no dia local
  (America/Campo_Grande), uma linha por nota.
- **Etiqueta da operação**: venda ou outra (consignação, devolução,
  bonificação, uso externo, etc.), derivada do CFOP da nota.

## Success Criteria

- **SC-001**: Operador identifica no grupo, sem abrir o site, quais linhas
  do resumo não são venda.
- **SC-002**: 100% das linhas de teste de não-venda contém `(CONSIG.)`
  depois do valor; 100% das linhas de venda não contém.
- **SC-003**: *(supersedido pela SPEC-021)* Cabeçalho (quantidade e
  total) é o das vendas do dia, não o de todas as emitidas.

## Assumptions

- “Não é venda” = qualquer operação cuja etiqueta fiscal não seja venda.
  O rótulo pedido pelo operador é `(CONSIG.)` para todas essas linhas,
  inclusive devolução de consignação e uso externo de ativo.
- O resumo continua no mesmo grupo e no mesmo horário.
