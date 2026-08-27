---
id: SPEC-015
status: approved
owner: QLMED
related_decisions: [ADR-0010]
affected_modules:
  - notification-outbox
  - n8n-daily-summary
---

# Feature Specification: Destino WhatsApp em grupo único

**Feature Branch**: `feat/whatsapp-group-destination`

**Created**: 2026-08-27

**Status**: Approved

**Input**: As mesmas mensagens de notas recebidas e do resumo diário de emitidas são
enviadas hoje a cada pessoa no WhatsApp. Passar a enviar uma vez para um grupo
em que todos estão.

## Problem

O canal WhatsApp replica a mesma mensagem N vezes (um envio por telefone). Isso
gera ruído, risco de destinatário divergente entre nota e relatório, e custo
desnecessário na Evolution API. O e-mail institucional e o e-mail por usuário
não fazem parte desta mudança.

## User scenarios and testing

### User Story 1 — Uma nota, um WhatsApp (Priority: P1)

Como operador fiscal, ao chegar uma NF-e ou CT-e recebida, vejo um único aviso
no grupo da empresa, com o mesmo conteúdo de hoje (texto + PDF).

**Independent Test**: Montar destinatários com dois usuários que têm telefone e
um JID de grupo configurado; a lista contém um WhatsApp (`…@g.us`) e nenhum
número pessoal.

**Acceptance Scenarios**:

1. **AC-001** — Given `NOTIFICATION_WHATSAPP_GROUP` (ou `QLMED_WHATSAPP_GROUP_JID`)
   com JID `…@g.us`, when o outbox monta destinos, then existe exatamente um
   destino `whatsapp` e ele é esse JID.
2. **AC-002** — Given o grupo configurado e vários usuários com telefone, when
   o outbox monta destinos, then nenhum telefone pessoal entra no canal WhatsApp.
3. **AC-003** — Given o grupo configurado, when ninguém está na lista de
   usuários notificáveis, then o WhatsApp do grupo ainda é enfileirado
   (canal institucional, análogo a `NOTIFICATION_ALWAYS_EMAIL`).

### User Story 2 — Rollback se o grupo ainda não existir (Priority: P1)

Como operador, se o JID do grupo ainda não estiver configurado, as notas
continuam no fan-out atual por telefone.

**Independent Test**: Montar destinos sem o quarto argumento / sem env; o
comportamento de SPEC-010 (telefone por usuário elegível) permanece.

**Acceptance Scenarios**:

1. **AC-004** — Given grupo ausente, when há usuário com telefone válido, then
   o WhatsApp pessoal é enfileirado como hoje.

### User Story 3 — Resumo diário no mesmo grupo (Priority: P1)

Como a equipe, o resumo das NF-e emitidas (n8n, 18h) chega uma vez no mesmo
grupo, não quatro vezes iguais.

**Independent Test**: O workflow `dailysummaryissued01` tem um único item em
`RECIPIENTS` e esse item é um JID `@g.us`.

**Acceptance Scenarios**:

1. **AC-005** — Given o resumo montado, when o node de envio dispara, then há
   uma cópia da mensagem por bloco de texto, todas para o mesmo JID de grupo.

## Requirements

### Functional requirements

- **FR-001**: JID de grupo WhatsApp (`<id>@g.us`) MUST ser destinatário válido
  do canal `whatsapp` e entrar na chave de idempotência já normalizado.
- **FR-002**: Com grupo configurado, o outbox MUST criar no máximo um
  `NotificationDelivery` WhatsApp por evento `invoice_received`.
- **FR-003**: Com grupo configurado, telefones pessoais MUST NOT gerar
  delivery WhatsApp.
- **FR-004**: E-mail (usuários elegíveis + destinatário institucional) MUST
  permanecer inalterado.
- **FR-005**: Preferência individual (`wantsNotification`) MUST continuar
  governando o e-mail; MUST NOT silenciar o WhatsApp do grupo.
- **FR-006**: Sem grupo configurado, o fan-out por telefone MUST permanecer.
- **FR-007**: O resumo diário n8n MUST usar o mesmo grupo, sem lista de
  celulares.

### Failure cases

- **FAIL-001**: JID configurado sem `@g.us` ou com formato inválido — o outbox
  ignora o valor e cai no FR-006 (não quebra a importação da nota).
- **FAIL-002**: Evolution recusa o envio ao grupo — o worker existente marca
  `dead`/`uncertain` como hoje; sem retentativa automática após `submitting`.

### Non-functional

- Sem migration. Sem canal novo. Worker Python inalterado: já envia para
  `delivery.recipient`.
- Segredos da Evolution não entram no repositório. O JID do grupo não é segredo.

### Out of scope

- Preferência por canal (e-mail sim / WhatsApp não).
- Relatório de válvulas Corcym (hoje só e-mail).
- Alertas de CI/Spec Kit no WhatsApp.
- Criar o grupo a cada nota; a criação é operação única fora do outbox.

## Assumptions

- O grupo é criado uma vez na Evolution (`qlmed-whatsapp`) com as pessoas que
  já recebem o resumo diário; o JID resultante vai para o env do app
  (`NOTIFICATION_WHATSAPP_GROUP` ou `QLMED_WHATSAPP_GROUP_JID`).
- Grupo criado em 2026-08-27: assunto `QLMED Fiscal`, JID
  `120363411914746947@g.us`.
- Quem entra ou sai do grupo passa a ser gestão do WhatsApp, não cadastro de
  telefone no painel.

## Success criteria

- Uma NF-e recebida gera no máximo um envio WhatsApp.
- O resumo das 18h gera no máximo um envio WhatsApp por bloco de texto.
- E-mail de notas não muda.
