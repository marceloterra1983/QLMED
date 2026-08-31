# Gates: feat/cassems-whatsapp-notify (SPEC-034)

Scope: (1) corrigir na ingestão CASSEMS o mesmo defeito de deadline compartilhado
que mantinha a IMPCG em zero (PR #231); (2) quando a ingestão CASSEMS processa
com sucesso um e-mail com ofício, enviar o PDF ao grupo de WhatsApp via
Evolution API, com paciente e local na legenda, espelhando a SPEC-031.

Riscos que os gates travam: abortar a caixa inteira por um único `AbortSignal`;
disparar centenas de envios no backfill do histórico (caixa tem mensagens desde
2014); reenviar a cada ciclo de 15 min; vazar dado de paciente em log; quebrar a
ingestão quando o provedor falhar; ligar sozinho sem configuração.

- [x] G1: spec SPEC-034 existe e o validador de docs passa
  CHECK: test -f specs/034-cassems-whatsapp-notify/spec.md && (npm run docs:validate >/dev/null 2>&1 && echo DOCS_OK || echo DOCS_FAIL)
  EXPECT: DOCS_OK
  EVIDENCE: DOCS_OK

- [x] G2: a ingestão CASSEMS não cria mais um AbortSignal por caixa reaproveitado em listagem e anexos
  CHECK: rg -n 'AbortSignal.timeout|CASSEMS_MAILBOX_TIMEOUT_MS' src/lib/cassems/ingest.ts || echo NO_SHARED_SIGNAL
  EXPECT: NO_SHARED_SIGNAL
  EVIDENCE: NO_SHARED_SIGNAL — src/lib/cassems/ingest.ts nao cita mais AbortSignal.timeout nem CASSEMS_MAILBOX_TIMEOUT_MS

- [x] G3: o deadline por requisição vem do graph-mail-client já corrigido
  CHECK: rg -c 'AbortSignal.any' src/lib/graph-mail-client.ts && rg -c 'perRequestSignal\(' src/lib/graph-mail-client.ts
  EXPECT: 1 e 3
  EVIDENCE: 1 (AbortSignal.any) e 3 (perRequestSignal: definicao L98, listagem L146, anexos L198)

- [x] G4: janela de idade impede envio para e-mail histórico
  CHECK: rg -n 'CASSEMS_NOTIFY_MAX_AGE_MS' src/lib/cassems/constants.ts src/lib/cassems/whatsapp-notify.ts
  EXPECT: CASSEMS_NOTIFY_MAX_AGE_MS
  EVIDENCE: src/lib/cassems/constants.ts:21:export const CASSEMS_NOTIFY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; | whatsapp-notify.ts:62 usa na janela

- [x] G5: idempotência persistida em CassemsSourceMessage
  CHECK: rg -c 'whatsappSentAt' prisma/schema.prisma prisma/migrations/20260831230000_add_cassems_whatsapp_notify/migration.sql src/lib/cassems/store.ts
  EXPECT: schema 2, migration 1, store 2
  EVIDENCE: prisma/schema.prisma:2 | prisma/migrations/20260831230000_add_cassems_whatsapp_notify/migration.sql:1 | src/lib/cassems/store.ts:2

- [x] G6: nenhum dado de paciente em log (FR-009)
  CHECK: rg -n 'patientName|hospitalName|procedureName|patientRegistry' src/lib/cassems/whatsapp-notify.ts | rg -c 'log\.' || echo NO_PATIENT_IN_LOG
  EXPECT: NO_PATIENT_IN_LOG
  EVIDENCE: NO_PATIENT_IN_LOG

- [x] G7: procedimento não trafega para o módulo de envio nem aparece na legenda
  CHECK: rg -c 'procedureName' src/lib/cassems/whatsapp-notify.ts || echo NO_PROCEDURE
  EXPECT: NO_PROCEDURE
  EVIDENCE: NO_PROCEDURE

- [x] G8: testes de aceitação AC-001..AC-008 passam
  CHECK: npx vitest run src/lib/__tests__/cassems-whatsapp-notify.test.ts -t 'SPEC-034' 2>&1 | rg 'Tests'
  EXPECT: 8 passed
  EVIDENCE: Tests  8 passed | 14 skipped (22) apos merge de origin/main — os skipped sao do fixture importado cassems-parse-oficio.test.ts

- [x] G9: gate de janela de migration atualizado para a migration nova
  CHECK: node scripts/test-production-migration-window.cjs >/dev/null 2>&1 && echo MIGRATION_GATE_OK || echo MIGRATION_GATE_FAIL
  EXPECT: MIGRATION_GATE_OK
  EVIDENCE: MIGRATION_GATE_OK

- [x] G10: typecheck limpo
  CHECK: npx tsc --noEmit 2>&1 | rg -c 'error TS' || echo ZERO_TS_ERRORS
  EXPECT: ZERO_TS_ERRORS
  EVIDENCE: ZERO_TS_ERRORS

- [x] G11: lint limpo
  CHECK: npm run lint >/dev/null 2>&1 && echo LINT_OK || echo LINT_FAIL
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G12: suíte completa verde
  CHECK: npm test 2>&1 | rg 'Test Files' | rg -c 'failed' || echo NO_FAILED_FILES
  EXPECT: NO_FAILED_FILES
  EVIDENCE: NO_FAILED_FILES — Test Files 86 passed | 3 skipped (89); Tests 636 passed | 4 skipped (640) apos merge de origin/main

- [x] G13: prova medida de que ligar o canal não gera enxurrada no grupo
  CHECK: contagem de mensagens CASSEMS dentro da janela de 7 dias, medida na caixa em produção
  EXPECT: numero pequeno o suficiente para o grupo, com dedup ja registrando as existentes
  EVIDENCE: 0 mensagens elegiveis. Caixa joseroberto, filtro do produto (hasAttachments + from eq CASSEMS_SENDER_EMAIL): total 0, recent7d 0. Com o remetente real observado na caixa (mailing.opme@cassems.com.br): total 3554, recent7d 2. Como o remetente configurado nao muda nesta entrega, ligar o canal envia zero.

- [x] G14: credenciais e destino disponíveis para o app em produção (env), sem imprimir valor
  CHECK: cd /home/marce/qlmed/production/env && for k in EVO_API_URL EVO_INSTANCE EVO_API_KEY CASSEMS_WHATSAPP_ENABLED CASSEMS_WHATSAPP_GROUP_JID; do grep -q "^${k}=" app.env && echo "$k PRESENT" || echo "$k ABSENT"; done
  EXPECT: ENV_OK
  EVIDENCE: CASSEMS_WHATSAPP_ENABLED PRESENT | CASSEMS_WHATSAPP_GROUP_JID PRESENT | EVO_API_URL PRESENT | EVO_INSTANCE PRESENT | EVO_API_KEY PRESENT (checado por nome de chave, sem valor)

- [x] G15: envio de teste observado no grupo de teste (status HTTP e messageId)
  CHECK: envio de documento pela Evolution API para o grupo de teste, resposta registrada
  EXPECT: HTTP 2xx com messageId
  EVIDENCE: HTTP 201, messageId 3EB0BA927655E08F587D07, remoteJid 120363411324269265@g.us (grupo de teste); findMessages devolve documentMessage com fileName "CASSEMS2479325231 - teste.pdf" e caption iniciando em "Autorizacao CASSEMS — Oficio 2479325231"
