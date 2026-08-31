---
id: SPEC-034
status: approved
owner: QLMED
affected_modules:
  - cassems-ingest
  - whatsapp-evolution
---

# Feature Specification: PDF do ofício CASSEMS no grupo do WhatsApp

**Feature Branch**: `feat/cassems-whatsapp-notify`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Replicar no convênio CASSEMS o canal já aprovado e em produção para o
IMPCG (SPEC-031): ao receber e-mail com ofício de autorização, enviar o PDF ao
grupo de WhatsApp com os dados do paciente e o local de entrega. Não responder o
e-mail. Legenda idêntica à do IMPCG, sem procedimento.

## Problem

A ingestão CASSEMS (SPEC-024) arquiva o PDF no OneDrive e persiste a
autorização, mas ninguém é avisado — o mesmo problema que a SPEC-031 resolveu
para o IMPCG. Quem precisa agir sobre a autorização descobre depois, olhando o
painel.

O canal WhatsApp já existe no produto (ADR-0010, SPEC-015, SPEC-031): o módulo
`src/lib/whatsapp-evolution.ts` envia documento via Evolution API
`POST /message/sendMedia/{instance}` para um JID de grupo. Esta feature
reaproveita esse módulo; nenhuma dependência nova é introduzida.

## Defeito de coleta corrigido junto (deadline compartilhado)

A `runCassemsIngest` criava **um único** `AbortSignal.timeout(CASSEMS_MAILBOX_TIMEOUT_MS)`
por caixa e o reutilizava na paginação completa da listagem e em **todos** os
downloads de anexo daquela caixa. Era o mesmo defeito corrigido no IMPCG: com
histórico longo, os 30 s viram orçamento da caixa inteira e a coleta é abortada
antes de processar qualquer mensagem. A correção segue a mesma abordagem: a
ingestão deixa de criar o signal e o deadline passa a valer por requisição HTTP,
via `perRequestSignal` em `src/lib/graph-mail-client.ts`, que a CASSEMS já usa.

- **FR-010**: A coleta CASSEMS MUST NÃO compartilhar um único deadline entre a
  paginação da listagem e os downloads de anexo de uma caixa. O orçamento de
  tempo MUST valer por requisição HTTP.

## Risco aceito pelo dono (dado de saúde em canal de terceiro)

O solicitante pediu explicitamente nome do paciente e local na mensagem. Isso
publica dado de saúde (paciente, matrícula, médico, hospital) em um grupo de
WhatsApp, canal operado por terceiro, cujos membros são geridos fora do produto.
O procedimento fica fora do corpo e nem é passado ao módulo de envio. O
Princípio V da constituição restringe dado sensível; esta feature amplia
deliberadamente essa exposição **por decisão registrada do dono do produto**,
reiterada para o CASSEMS. Mitigações adotadas: destino único e configurado (não
há envio para telefone arbitrário); nenhum dado de paciente em log; recurso
desligado por padrão sem configuração explícita.

## Requirements

- **FR-001**: Ao processar com sucesso um e-mail do CASSEMS que gerou
  autorização (criação nova ou upgrade de parse), o sistema MUST enviar o PDF do
  ofício ao grupo de WhatsApp configurado, como documento, via Evolution API
  `POST /message/sendMedia/{instance}`.
- **FR-002**: A legenda MUST conter número do ofício, nome do paciente e o local
  de entrega. Quando presentes, MUST conter também matrícula e médico com CRM.
  A legenda MUST NÃO conter o procedimento, e o procedimento MUST NÃO ser
  passado ao módulo de envio.
- **FR-003**: Quando o local não foi lido do PDF, a legenda MUST indicar local
  não identificado em vez de omitir a linha.
- **FR-004**: O envio MUST ser idempotente por mensagem de origem. O sistema
  grava `whatsappSentAt` e `whatsappMessageId` em `CassemsSourceMessage` e MUST
  NÃO reenviar em ciclos seguintes (a coleta roda a cada 15 minutos).
- **FR-005**: O sistema MUST NÃO enviar para mensagem recebida há mais de
  `CASSEMS_NOTIFY_MAX_AGE_MS` (7 dias). A caixa monitorada tem mensagens do
  remetente desde 2014; sem essa janela um backfill dispararia milhares de
  envios.
- **FR-006**: O recurso MUST estar desligado quando faltar qualquer configuração
  (`CASSEMS_WHATSAPP_ENABLED`, destino do grupo, ou credenciais Evolution).
- **FR-007**: Falha no envio MUST NÃO abortar a ingestão nem desfazer a
  autorização já persistida.
- **FR-008**: O destino MUST ser um JID de grupo (`…@g.us`), reaproveitando a
  normalização já usada pelo outbox fiscal. Telefone individual MUST ser
  recusado.
- **FR-009**: Log MUST citar apenas o número do ofício e o resultado. Nome de
  paciente, matrícula, procedimento, local e valor MUST NÃO ser logados.

## Roles and ownership

O envio ocorre no serviço de background da ingestão, sob o `companyId` de
`getSingleCompany()`, como o restante da SPEC-024. Não há rota HTTP nova, logo
nenhuma superfície de autorização nova. O destino é um único grupo configurado
por env, nunca derivado de dado de request.

## Failure cases

- Evolution responde 4xx/5xx: registra erro sanitizado e segue (FR-007).
- Timeout: orçamento próprio de requisição, não compartilhado com a coleta.
- Config ausente: nenhum envio, nenhum erro (FR-006).
- Gravação de `whatsappSentAt` falha após envio: risco de reenvio no próximo
  ciclo. Aceito e registrado; marcar antes de enviar perderia envios
  silenciosamente, o que é pior para o operador.

## Non-functional requirements

- **NFR-001**: Uma chamada Evolution por autorização nova, no máximo.
- **NFR-002**: Nenhum dado de paciente em log (FR-009).
- **NFR-003**: O envio não pode aumentar o tempo de coleta a ponto de estourar a
  janela: timeout próprio e bounded, sem retry dentro do ciclo.

## Acceptance criteria

- **AC-001**: Mensagem nova com ofício válido gera um envio com o PDF anexado.
- **AC-002**: Legenda contém ofício, paciente, matrícula, médico e local, e não
  contém procedimento.
- **AC-003**: Local ausente vira "não identificado" na legenda.
- **AC-004**: Mensagem já marcada como enviada não gera segundo envio.
- **AC-005**: Mensagem mais antiga que a janela não gera envio.
- **AC-006**: Falha do provedor não impede a persistência da autorização.
- **AC-007**: Sem configuração, nenhum envio é tentado.
- **AC-008**: Destino que não seja `…@g.us` é recusado.

## Applicable ADRs

ADR-0010 (destino WhatsApp é um grupo, não fan-out por telefone) permanece
válido e é estendido para o canal CASSEMS.

## Test strategy

Testes unitários da legenda e da elegibilidade, e teste de integração do fluxo
de ingestão com porta de WhatsApp falsa cobrindo AC-001..AC-008. Nenhum teste
toca a Evolution real.

## Out of scope

Responder o e-mail do CASSEMS. Reenvio manual pela interface. Backfill de envio
para autorizações históricas já coletadas. Reescrever o outbox fiscal.
Correção do remetente configurado da coleta CASSEMS: a apuração desta entrega
mostrou que `CASSEMS_SENDER_EMAIL` não casa com nenhuma mensagem da caixa
monitorada, o que mantém a coleta de e-mail em zero. Trocar esse valor
desencadeia um backfill de milhares de mensagens com upload ao OneDrive e é
decisão operacional separada, fora desta spec.
