---
id: SPEC-036
status: approved
owner: QLMED
related_specs: [SPEC-024, SPEC-034]
affected_modules:
  - cassems-ingest
---

# Feature Specification: Remetentes da coleta CASSEMS

**Feature Branch**: `fix/cassems-sender-mailing-opme`

**Created**: 2026-08-31

**Status**: Approved

**Input**: A coleta deve ler a caixa `joseroberto@qlmed.com.br`. O
remetente configurado em SPEC-024 (`oficio.cconecte@cassems.com.br`)
devolve zero mensagens. O remetente real observado na caixa é
`mailing.opme@cassems.com.br` e deve ser aceito **além** do antigo,
não no lugar dele.

## Problem

A ingestão CASSEMS (SPEC-024) filtra um único remetente. Esse endereço
não aparece na caixa monitorada: a listagem Graph responde 200 e
devolve 0 mensagens. O ofício OPME chega de `mailing.opme@cassems.com.br`.
SPEC-034 deixou a correção fora de escopo porque o backfill histórico
é grande; o dono autorizou o remetente adicional agora.

A janela de aviso WhatsApp de 7 dias (SPEC-034 FR-005) permanece: o
histórico desde 2014 não deve disparar milhares de envios.

## User Scenarios & Testing

### User Story 1 - Coleta lê o ofício que já está na caixa (Priority: P1)

O operador espera que o ofício CASSEMS que chegou na caixa da empresa
vire autorização no painel. A coleta precisa aceitar o remetente que
de fato envia o PDF.

**Why this priority**: Sem o remetente real a coleta de e-mail fica
em zero mesmo com a caixa correta e Graph 200.

**Independent Test**: Listagem da caixa com o remetente OPME devolve
as mensagens com anexo; o remetente antigo continua no filtro.

**Acceptance Scenarios**:

1. **Given** a caixa `joseroberto@qlmed.com.br` com ofício de
   `mailing.opme@cassems.com.br` e anexo, **When** a coleta lista,
   **Then** a mensagem entra no processamento.
2. **Given** um e-mail futuro de `oficio.cconecte@cassems.com.br` com
   anexo, **When** a coleta lista, **Then** essa mensagem também entra.
3. **Given** a mesma mensagem aparecendo nos dois filtros com o mesmo
   `internetMessageId`, **When** a coleta une as listas, **Then** processa
   uma vez só.

### Edge Cases

- Remetente antigo com zero mensagens: a coleta segue com o OPME.
- Graph recusa `or` de dois `from`: listar cada remetente e unir por
  `internetMessageId`.
- Histórico de milhares de PDFs: o orçamento de tempo vale por
  requisição HTTP, não por caixa (SPEC-034 FR-010).

## Requirements

### Functional Requirements

- **FR-001**: A caixa monitorada MUST permanecer
  `joseroberto@qlmed.com.br`.
- **FR-002**: A coleta MUST aceitar mensagens com anexo dos remetentes
  `oficio.cconecte@cassems.com.br` e `mailing.opme@cassems.com.br`.
  O segundo é adicional; o primeiro MUST permanecer no filtro.
- **FR-003**: Mensagens com o mesmo `internetMessageId` MUST ser
  processadas uma única vez, mesmo se os dois filtros as devolverem.
- **FR-004**: O aviso WhatsApp MUST continuar limitado à janela de
  7 dias de SPEC-034 FR-005. O backfill histórico MUST NÃO gerar
  envio fora dessa janela.
- **FR-005**: A coleta MUST NÃO compartilhar um único deadline entre
  a paginação e os downloads de anexo de uma caixa.

## Roles and ownership

A coleta continua no serviço de background, sob o `companyId` de
`getSingleCompany()`, como em SPEC-024. Nenhuma rota HTTP nova. Nenhuma
superfície de autorização nova.

## Failure cases

- Graph 401/403 na caixa: falha da caixa, demais remetentes daquela
  tentativa não compensam; o ciclo registra o erro e segue.
- Um remetente devolve vazio e o outro não: a união usa só o que veio.
- Timeout de uma página: orçamento por requisição; a coleta não aborta
  a caixa inteira por um deadline compartilhado.

## Non-functional requirements

- **NFR-001**: Dois endereços no filtro. Se a listagem nativa com `or`
  não for usada, duas listagens e união por `internetMessageId` são
  aceitáveis.
- **NFR-002**: Nenhum token, credencial ou `.env` em log.

## Acceptance criteria

- **AC-001**: Listagem inclui mensagens de `mailing.opme@cassems.com.br`.
- **AC-002**: Listagem continua incluindo `oficio.cconecte@cassems.com.br`.
- **AC-003**: `internetMessageId` repetido nas duas listagens vira uma
  mensagem.
- **AC-004**: A caixa monitorada permanece `joseroberto@qlmed.com.br`.

## Applicable ADRs

Nenhum ADR novo. ADR-0010 permanece para o destino WhatsApp (SPEC-034).

## Test strategy

Teste unitário da listagem com os dois remetentes e deduplicação por
`internetMessageId`, sem chamar Graph real. A confirmação do endereço
exato e da janela de 7 dias é operacional, medida na caixa, sem
imprimir token.

## Out of scope

Trocar a caixa monitorada. Remover `oficio.cconecte@cassems.com.br`.
Backfill de WhatsApp para ofícios fora da janela de 7 dias. Migration
Prisma. Alterar o grupo WhatsApp ou as flags de envio.

## Assumptions

- O endereço OPME confirmado na caixa é exatamente
  `mailing.opme@cassems.com.br`.
- O volume na janela de 7 dias cabe no risco já aceito de SPEC-034
  (poucos avisos ao grupo da equipe).
