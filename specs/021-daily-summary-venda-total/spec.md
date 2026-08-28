---
id: SPEC-021
status: approved
owner: QLMED
related_decisions: [ADR-0010]
affected_modules:
  - invoices-api
  - n8n-daily-summary
supersedes:
  - SPEC-018#AC-003
  - SPEC-018#FR-004
  - SPEC-018#SC-003
---

# Feature Specification: Total do resumo diário só com venda

**Feature Branch**: `feat/daily-summary-venda-total`

**Created**: 2026-08-28

**Status**: Approved

**Input**: No relatório de venda que será enviado, somar somente as notas
de vendas. O resumo diário de NF-e emitidas (grupo WhatsApp, fim do dia)
não pode tratar consignação, devolução, uso externo ou CFOP desconhecido
como faturamento.

## Problem

A SPEC-018 marca a linha de não-venda com `(CONSIG.)`, mas o cabeçalho
ainda conta e soma **todas** as emitidas do dia (AC-003 / FR-004 / SC-003).
Quem lê o grupo vê um “valor total” inflado por notas que não são venda.
O pedido agora é o contrário para os totais: somar só nota de venda.

## Roles and ownership

- **Operador no grupo WhatsApp**: lê o resumo; não autentica no app para
  essa leitura.
- **Sistema (resumo do dia)**: monta a mensagem a partir das NF-e emitidas
  da empresa no dia local. Sem mudança de permissão: a lista de emitidas
  continua exigindo sessão/API como hoje (SPEC-018 US2). Isolamento por
  empresa permanece no servidor.

## User scenarios and testing

### User Story 1 — Cabeçalho de venda, não de tudo (Priority: P1)

Como operador no grupo, no resumo do dia eu vejo quantidade e valor só
das notas de venda. Linhas de consignação, devolução ou outra não-venda
ainda aparecem com `(CONSIG.)`, mas **não** entram na soma nem na
contagem do cabeçalho.

**Why this priority**: é o pedido. O dinheiro do cabeçalho é o que o
grupo trata como vendido.

**Independent Test**: Montar o cabeçalho de um dia com a nota 65159
(venda, R$ 4.800,00) e a 65160 (devolução de consignação, R$ 5.890,85).
Contagem = 1; total = R$ 4.800,00. A linha 65160 continua com `(CONSIG.)`.

**Acceptance Scenarios**:

1. **AC-001** — Given emitidas do dia com pelo menos uma venda e uma
   não-venda, when o resumo é montado, then a quantidade do cabeçalho
   MUST ser só a das vendas.
2. **AC-002** — Given as mesmas notas, when o resumo é montado, then o
   valor do cabeçalho MUST ser a soma só das vendas, em reais.
3. **AC-003** — Given uma não-venda no dia, when o resumo é montado,
   then a linha individual MUST continuar com `(CONSIG.)` depois do valor
   (SPEC-018) e MUST NOT ser somada no cabeçalho.

### User Story 2 — Não-venda nunca vira faturamento (Priority: P1)

Como sistema, consignação, devolução, uso externo, CFOP vazio ou
desconhecido não entram na soma enviada. “Venda” é a classificação
fiscal já usada na SPEC-018.

**Why this priority**: sem isso, um CFOP novo ou vazio voltaria a inflar
o total.

**Independent Test**: Cabeçalho de um dia só com não-venda (ou CFOP
ausente) fica com quantidade 0 e valor zero; as linhas ainda listam as
notas com `(CONSIG.)`.

**Acceptance Scenarios**:

1. **AC-004** — Given só notas cuja etiqueta fiscal não é venda, when o
   resumo é montado, then quantidade do cabeçalho é 0 e o valor é zero.
2. **AC-005** — Given CFOP ausente ou desconhecido, when o item é
   classificado para o cabeçalho, then MUST NOT contar como venda.

## Requirements

### Functional requirements

- **FR-001**: A quantidade do cabeçalho do resumo diário enviado MUST
  contar somente notas classificadas como venda.
- **FR-002**: O valor do cabeçalho MUST somar somente o valor dessas
  vendas.
- **FR-003**: A decisão venda / não-venda MUST reutilizar a
  classificação fiscal da SPEC-018 (etiqueta da operação = venda).
- **FR-004**: Não-venda MUST permanecer visível na lista com o sufixo
  `(CONSIG.)` e MUST NOT entrar em FR-001 nem FR-002.
- **FR-005**: O rótulo do cabeçalho MUST deixar claro que quantidade e
  valor são de venda, não de todas as emitidas.
- **FR-006**: Esta spec substitui SPEC-018 AC-003, FR-004 e SC-003. O
  restante da SPEC-018 (sufixo por linha, etiqueta na lista) permanece.

### Failure cases

- **FAIL-001**: CFOP ausente ou desconhecido — não-venda; não soma.
- **FAIL-002**: Dia sem emitidas — mensagem vazia atual, sem inventar
  total.
- **FAIL-003**: Dia só com não-venda — cabeçalho zerado; linhas listadas.

### Non-functional

- Sem migration.
- Sem XML no log nem no resumo.
- Valores monetários sem float solto na regra canônica (soma em
  dinheiro com arredondamento já usado no produto).
- Evidência: testes da soma/contagem do cabeçalho e regressão do sufixo.

### Out of scope

- Mostrar dois totais lado a lado (venda e consignação).
- Relabelar a tela `/fiscal/issued`.
- Reenviar o resumo já entregue hoje.
- Mudar destinatário do grupo (SPEC-015 / ADR-0010).
- Tag **Cancelado** e persistência de cancelamento (SPEC-020, em curso):
  quando a nota cancelada estiver identificada no item da lista, ela
  MUST sair da soma de venda; até lá, o follow-up fica explícito — esta
  spec não bloqueia.

## Key entities

- **Cabeçalho do resumo**: quantidade e valor enviados no topo da
  mensagem do dia — agora só venda.
- **Linha da nota**: número, destinatário, valor e sufixo `(CONSIG.)`
  quando não for venda (SPEC-018).
- **Etiqueta da operação**: venda ou outra, derivada do primeiro CFOP
  persistido.

## Success Criteria

- **SC-001**: Em um dia misto (venda + não-venda), o valor enviado no
  cabeçalho coincide com a soma só das vendas, 100% dos casos de teste.
- **SC-002**: A quantidade enviada no cabeçalho coincide com o número
  de vendas, 100% dos casos de teste.
- **SC-003**: 100% das linhas de não-venda de teste ainda mostram
  `(CONSIG.)`; nenhuma delas aumenta o total do cabeçalho.

## Assumptions

- “Venda” = a mesma etiqueta fiscal da SPEC-018 (não o nome do cliente).
- Contagem e soma do cabeçalho ficam **as duas** só de venda, para o
  grupo não ler “3 notas / R$ X de venda” quando X exclui consignação.
- O resumo continua no mesmo grupo e no mesmo horário.
- NF-e cancelada: se o item ainda não expõe cancelamento, a exclusão
  fica como follow-up da SPEC-020; a regra canônica já recusa item
  marcado como cancelado, quando o campo existir.
