---
id: SPEC-076
status: draft
owner: QLMED
related_decisions: []
affected_modules:
  - nfe-emission
---

# Feature Specification: Recomendação de follow-up após SEFAZ

**Feature Branch**: `feat/076-jev-sefaz-followup`

**Created**: 2026-09-18

**Status**: Draft

**Input**: Depois que a SEFAZ já classificou a emissão (autorizada, rejeitada ou
pendente), o operador ainda precisa saber se espera, tenta de novo ou trata na
hora. Um modelo de decisão externo (Jev, via OpenRouter) pode recomendar esse
passo. Ele NÃO pode mudar o desfecho fiscal.

## Problem

`cStat` e `xMotivo` já dizem o que a SEFAZ decidiu. O que falta é um julgamento
operacional: “lote em processamento” pede espera; certificado ou schema pede
gente. Sem isso, rejeição e pendência caem no mesmo saco para quem olha o log.

## User scenarios and testing

### User Story 1 — Lote em processamento não pagina gente (Priority: P1)

Como operador, quando a SEFAZ devolve lote em processamento, o sistema
recomenda retry/espera e não trata isso como alerta humano.

**Independent Test**: Dado outcome `pending` ou `rejected` com motivo de lote
em processamento, a recomendação é `retry` (ou equivalente de espera) e
`needs_human` fica baixo.

**Acceptance Scenarios**:

1. **AC-001** — Given um desfecho SEFAZ já calculado com `cStat` 323 e motivo
   de lote em processamento, when o follow-up corre, then a ação recomendada
   MUST NOT ser alertar um humano.
2. **AC-002** — Given o mesmo desfecho, when o follow-up corre, then o
   resultado fiscal (`pending`/`rejected` e o `cStat`) permanece o original.

### User Story 2 — Sem chave, o fluxo fiscal não muda (Priority: P1)

Como operador, se a chave do serviço de decisão não estiver configurada, a
emissão segue exatamente como hoje.

**Independent Test**: Sem a variável de ambiente da chave, o follow-up devolve
`skipped` e não lança.

**Acceptance Scenarios**:

1. **AC-003** — Given chave ausente, when o follow-up é pedido, then o
   resultado é `skipped` e nenhuma chamada externa é tentada.
2. **AC-004** — Given o serviço de decisão falha ou estoura tempo, when a
   emissão já tem desfecho SEFAZ, then a autorização MUST NOT falhar por causa
   do follow-up.

### User Story 3 — Rejeição de negócio pode recomendar alerta (Priority: P2)

Como operador, uma rejeição de certificado/schema/duplicidade pode ser
classificada como alerta humano, ainda sem disparar WhatsApp nesta versão.

**Independent Test**: Motivo de certificado vencido produz `alert` ou
`needs_human` alto; nenhum canal WhatsApp é enviado por este spec.

**Acceptance Scenarios**:

1. **AC-005** — Given `xMotivo` descrevendo certificado inválido, when o
   follow-up corre com o serviço disponível, then a recomendação é `alert`
   (ou `needs_human` ≥ 0,7).
2. **AC-006** — Given qualquer recomendação, when esta versão corre, then
   MUST NOT enfileirar WhatsApp nem e-mail.

### User Story 4 — Conteúdo fiscal é classificado sem instruções de terceiros (Priority: P1)

Como operador, quando o Jev recebe o retorno da SEFAZ, quero que ele classifique
os dados fiscais sem obedecer a texto de terceiros que apareça nesses dados.

**Independent Test**: As duas perguntas identificam o conteúdo de `state` como
dados para classificação, e cada opção neutra mantém a recomendação operacional
correspondente.

**Acceptance Scenarios**:

1. **AC-007** — Given as opções da pergunta de ação, when o serviço recebe a
   pergunta, then ela usa IDs neutros `a`, `b` e `c` com seus significados em
   `criteria`, e o follow-up mantém a recomendação operacional correspondente.
2. **AC-008** — Given campos de `state` com motivos da SEFAZ ou texto de terceiros,
   when as perguntas são enviadas, then ambas instruem o serviço a tratar esses
   conteúdos como dados a classificar, não como instruções.

### Edge Cases

- Outcome `authorized`: follow-up MUST NOT ser chamado.
- XML fiscal completo MUST NOT ser enviado ao serviço de decisão.
- Timeout ou HTTP de erro: `skipped`, log de aviso, emissão intacta.
- Texto de terceiros dentro de `state` não deve ser apresentado como instrução
  operacional do sistema.

## Requirements

- **FR-001**: O desfecho fiscal (autorizado / rejeitado / pendente e o `cStat`)
  MUST ser decidido só pela SEFAZ / interpretador atual. O follow-up MUST NOT
  alterá-lo.
- **FR-002**: Follow-up MUST correr só após `pending` ou `rejected`.
- **FR-003**: Sem chave configurada, follow-up MUST ser `skipped` e MUST NOT
  chamar rede.
- **FR-004**: Falha do follow-up MUST NOT mudar o status da emissão.
- **FR-005**: O estado enviado ao serviço MUST ser só outcome, `cStat`,
  `xMotivo` e ambiente — sem XML, certificado ou chave de acesso.
- **FR-006**: Esta versão MUST NOT enviar WhatsApp, e-mail ou push.
- **FR-007**: Recomendação e scores MUST ir só para log estruturado (sem
  segredos).
- **FR-008**: A pergunta de ação MUST usar identificadores neutros `a`, `b` e
  `c`; `criteria` MUST conter o significado, e o código MUST preservar o
  mapeamento operacional de retry, alerta e ausência de follow-up.
- **FR-009**: As instruções das duas perguntas MUST tratar o conteúdo de `state`,
  incluindo motivos SEFAZ e texto de terceiros, como dados para classificar, não
  como instruções, e MUST orientar a ignorar instruções embutidas nesse texto.

## Out of scope

- Substituir `interpretAutorizacaoResponse`.
- Classificar pastas de documentos (`documentos/classify.ts`).
- WhatsApp / outbox.
- SDK TypeSafe nativo (`TYPESAFE_API_KEY`); só o caminho OpenRouter.

## Success Criteria

- **SC-001**: Em 100% dos casos de teste, o `cStat` depois do follow-up é o
  mesmo de antes.
- **SC-002**: Sem chave, zero chamadas de rede no follow-up.
- **SC-003**: Lote em processamento não gera recomendação de alerta humano.
- **SC-004**: Falha simulada do serviço não transforma emissão autorizável em
  erro de autorização.
- **SC-005**: As três opções neutras mantêm as rotas operacionais correspondentes,
  e as duas perguntas incluem a guarda para conteúdo de terceiros em `state`.

## Assumptions

- A chave OpenRouter fica só em ambiente de servidor, nunca no browser.
- O serviço de decisão é o Jev via OpenRouter Decisions, já validado no
  playground local.
- Operadores leem logs da emissão NF-e no ambiente Omarchy/vps.

## Test strategy

- Testes unitários do módulo de follow-up com `decide` injetado (sem rede).
- Casos: sem chave; lote 323 → retry; certificado → alert; `decide` lança →
  skipped.
- `npx tsc --noEmit` no worktree.
