---
id: ADR-0011
status: accepted
date: 2026-08-27
supersedes: null
related_specs: [SPEC-016, SPEC-010, SPEC-015]
---

# Toque no celular de nota recebida é Web Push do PWA

## Context

O WhatsApp do QLMED não entrega botão de escolha em grupo. A decisão de
autorização será um link que abre o site. O usuário ainda quer um toque no
telefone quando uma nota recebida chega. O produto permanece PWA — sem app
de loja.

## Decision drivers

- Toque com o site fechado.
- Mesmo site, mesmo login, mesma autorização.
- Não alterar e-mail nem o WhatsApp do grupo (ADR-0010).
- Sem XML nem chave de acesso na tela de bloqueio.

## Considered options

### Option A — Só WhatsApp / e-mail

Já existe. Não toca o aparelho como app.

### Option B — App nativo ou casca de loja (TWA / Capacitor)

Resolve ícone na loja e push iOS mais previsível. Fora do combinado: continuar
no PWA.

### Option C — Web Push no PWA, canal `push` no outbox

Inscrição por aparelho, VAPID no servidor, entrega no outbox já existente.
Android Chrome funciona bem; iPhone só com PWA na Tela de Início.

## Decision

Option C. Canal pessoal `push`, governado pela preferência `invoice_received`
e pela permissão do navegador. Sem VAPID, o canal some e a importação da nota
não quebra. Envio pelo worker via API interna do app (não disfarçar de
WhatsApp, não baixar XML para o toque).

## Consequences

### Positive

- Toque no PWA sem novo produto móvel.
- Reusa outbox, preferência e clique `/r/{id}`.

### Negative

- iPhone exige instalação pelo Safari.
- VAPID é segredo de operação; sem ele não há toque.

### Follow-up

Tela de autorização no site (link do WhatsApp) continua fora desta decisão.
