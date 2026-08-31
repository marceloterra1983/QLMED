---
id: SPEC-031
status: approved
owner: QLMED
affected_modules:
  - impcg-ingest
  - whatsapp-evolution
---

# Feature Specification: PDF do ofício IMPCG no grupo do WhatsApp

**Feature Branch**: `feat/impcg-whatsapp-notify`

**Created**: 2026-08-31

**Status**: Approved

**Input**: Pedido do operador (2026-08-31): "quando recebido um e-mail com ofício
de autorização que o PDF seja enviado ao grupo do WhatsApp com os dados do
paciente, e local. Não responder este e-mail por enquanto." O primeiro envio é
um teste para um grupo administrado só pelo solicitante, para aprovação.

## Problem

A ingestão IMPCG (SPEC-023) arquiva o PDF no OneDrive e persiste a autorização,
mas ninguém é avisado. Quem precisa agir sobre a autorização (separar material,
levar ao local de entrega) descobre depois, olhando o painel.

O canal WhatsApp já existe no produto para nota fiscal (ADR-0010, SPEC-015): o
worker `scripts/notification-outbox-worker.py` envia o PDF como documento via
Evolution API (`/message/sendMedia`) para um JID de grupo. Esse worker é cravado
em nota fiscal (`--invoice-type NFE|CTE`, ativos buscados em
`/api/invoices/{id}/pdf`) e não serve para o ofício IMPCG sem reescrever o
outbox fiscal.

## Risco aceito pelo dono (dado de saúde em canal de terceiro)

O solicitante pediu explicitamente nome do paciente e local na mensagem. Isso
publica dado de saúde (paciente, procedimento, hospital) em um grupo de
WhatsApp, canal operado por terceiro, fora do controle da empresa. O Princípio V
da constituição restringe dado sensível; esta feature amplia deliberadamente
essa exposição por decisão do dono do produto. Mitigações adotadas: destino
único e configurado (não há envio para telefone arbitrário); nenhum dado de
paciente em log; recurso desligado por padrão sem configuração explícita.

## Requirements

- **FR-001**: Ao processar com sucesso um e-mail do IMPCG que gerou autorização
  (criação nova ou upgrade de parse), o sistema MUST enviar o PDF do ofício ao
  grupo de WhatsApp configurado, como documento, via Evolution API
  `POST /message/sendMedia/{instance}`.
- **FR-002**: A legenda MUST conter número do ofício, nome do paciente e o local
  de entrega (`hospitalName`, lido de `LOCAL DE ENTREGA:` ou `HOSPITAL:` pelo
  parser). Quando presentes, MUST conter também procedimento e médico.
- **FR-003**: Quando o local não foi lido do PDF, a legenda MUST indicar local
  não identificado em vez de omitir a linha, para o operador saber que precisa
  conferir.
- **FR-004**: O envio MUST ser idempotente por mensagem de origem. O sistema
  grava `whatsappSentAt` e `whatsappMessageId` em `ImpcgSourceMessage` e MUST
  NÃO reenviar em ciclos seguintes (a coleta roda a cada 15 minutos).
- **FR-005**: O sistema MUST NÃO enviar para mensagem recebida há mais de
  `IMPCG_NOTIFY_MAX_AGE_MS` (7 dias). A coleta varre a caixa inteira, com
  e-mails desde 2018; sem essa janela o backfill dispararia centenas de envios.
- **FR-006**: O recurso MUST estar desligado quando faltar qualquer configuração
  (`IMPCG_WHATSAPP_ENABLED`, destino do grupo, ou credenciais Evolution). Sem
  configuração o comportamento é o de hoje: coleta normal, nenhum envio.
- **FR-007**: Falha no envio MUST NÃO abortar a ingestão nem desfazer a
  autorização já persistida. O erro entra no resultado da execução e a coleta
  segue para a próxima mensagem.
- **FR-008**: O destino MUST ser um JID de grupo (`…@g.us`), reaproveitando a
  normalização já usada pelo outbox fiscal. Número de telefone individual MUST
  ser recusado.
- **FR-009**: Log MUST citar apenas o número do ofício e o resultado. Nome de
  paciente, matrícula, procedimento, local e valor MUST NÃO ser logados.

## Roles and ownership

O envio ocorre no serviço de background da ingestão, sob o `companyId` de
`getSingleCompany()`, como o restante da SPEC-023. Não há rota HTTP nova, logo
nenhuma superfície de autorização nova. O destino é um único grupo configurado
por env, nunca derivado de dado de request.

## Failure cases

- Evolution responde 4xx/5xx: registra erro sanitizado e segue (FR-007).
- Timeout: orçamento próprio de requisição, não compartilhado com a coleta.
- Config ausente: nenhum envio, nenhum erro (FR-006).
- Gravação de `whatsappSentAt` falha após envio: risco de reenvio no próximo
  ciclo. Aceito e registrado; a alternativa (marcar antes de enviar) perderia
  envios silenciosamente, o que é pior para o operador.

## Non-functional requirements

- **NFR-001**: Uma chamada Evolution por autorização nova, no máximo.
- **NFR-002**: Nenhum dado de paciente em log (FR-009).
- **NFR-003**: O envio não pode aumentar o tempo de coleta a ponto de estourar a
  janela: timeout próprio e bounded, sem retry dentro do ciclo.

## Acceptance criteria

- **AC-001**: Mensagem nova com ofício válido gera um envio com o PDF anexado.
- **AC-002**: Legenda contém ofício, paciente e local.
- **AC-003**: Local ausente vira "não identificado" na legenda.
- **AC-004**: Mensagem já marcada como enviada não gera segundo envio.
- **AC-005**: Mensagem mais antiga que a janela não gera envio.
- **AC-006**: Falha do provedor não impede a persistência da autorização.
- **AC-007**: Sem configuração, nenhum envio é tentado.
- **AC-008**: Destino que não seja `…@g.us` é recusado.

## Applicable ADRs

ADR-0010 (destino WhatsApp é um grupo, não fan-out por telefone) permanece
válido e é estendido para o canal IMPCG.

## Test strategy

Testes unitários da legenda e da elegibilidade, e teste de integração do fluxo
de ingestão com porta de WhatsApp falsa cobrindo AC-001..AC-008. Nenhum teste
toca a Evolution real.

## Out of scope

Responder o e-mail do IMPCG (pedido explicitamente adiado pelo solicitante).
Reenvio manual pela interface. Backfill de envio para as 97 autorizações
históricas já coletadas. Reescrever o outbox fiscal para carregar eventos não
fiscais.
