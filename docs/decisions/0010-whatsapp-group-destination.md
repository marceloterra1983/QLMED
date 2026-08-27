---
id: ADR-0010
status: accepted
date: 2026-08-27
supersedes: null
related_specs: [SPEC-015, SPEC-010]
---

# WhatsApp fiscal sai para um grupo, não para cada telefone

## Context

Notas recebidas (outbox) e o resumo diário de emitidas (n8n) repetem a mesma
mensagem em cada celular. O conteúdo é institucional, não pessoal.

## Decision drivers

- Uma mensagem por evento no WhatsApp.
- Mesmo público para nota e relatório.
- Não quebrar e-mail nem a importação da nota se o grupo ainda não estiver no env.

## Considered options

### Option A — Continuar o fan-out por telefone do cadastro

Já funciona, mas multiplica envio idêntico e diverge da lista hardcoded do n8n.

### Option B — Um JID de grupo configurado no env

Um destino. Quem entra ou sai é gestão do WhatsApp. Sem migration.

## Decision

Option B. `NOTIFICATION_WHATSAPP_GROUP` ou `QLMED_WHATSAPP_GROUP_JID` com
`…@g.us` substitui o fan-out WhatsApp. Ausente ou inválido, permanece o
comportamento de SPEC-010. Preferência individual não silencia o grupo
(canal institucional, como `NOTIFICATION_ALWAYS_EMAIL`).

## Consequences

### Positive

- Um envio por nota; resumo diário alinhado ao mesmo grupo.
- Sem schema novo.

### Negative

- Opt-out individual deixa de valer no WhatsApp.
- Quem não estiver no grupo deixa de ver o aviso, mesmo com telefone no cadastro.

## Verification

Testes de `buildInvoiceNotificationDestinations` e
`normalizeNotificationRecipient` em `notification-outbox.test.ts`.
O workflow `dailysummaryissued01` tem um único `RECIPIENTS` `@g.us`.
