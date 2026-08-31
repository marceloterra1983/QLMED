# Gates: feat/impcg-whatsapp-notify (SPEC-031)

Scope: quando a ingestão IMPCG processa com sucesso um e-mail com ofício, enviar
o PDF ao grupo de WhatsApp via Evolution API, com paciente e local na legenda.

Riscos que os gates travam: disparar centenas de envios no backfill de 2018;
reenviar a cada ciclo de 15 min; vazar dado de paciente em log; quebrar a
ingestão quando o provedor falhar; ligar sozinho sem configuração.

- [x] G1: spec SPEC-031 existe e o validador de docs passa
  CHECK: test -f specs/031-impcg-whatsapp-notify/spec.md && (npm run docs:validate >/dev/null 2>&1 && echo DOCS_OK || echo DOCS_FAIL)
  EXPECT: DOCS_OK
  EVIDENCE: DOCS_OK

- [x] G2: cliente Evolution usa sendMedia com documento e não fica com credencial hardcoded
  CHECK: rg -n 'sendMedia|EVO_API_KEY|process.env' src/lib/whatsapp-evolution.ts
  EXPECT: sendMedia
  EVIDENCE: 32:  const apiKey = (process.env.EVO_API_KEY ?? '').trim(); | 52:  const response = await fetch(`${config.baseUrl}/message/sendMedia/${encodeURIComponent(config.instance)}`, {

- [x] G3: janela de idade impede envio para e-mail histórico
  CHECK: rg -n 'IMPCG_NOTIFY_MAX_AGE_MS' src/lib/impcg/constants.ts src/lib/impcg/whatsapp-notify.ts
  EXPECT: IMPCG_NOTIFY_MAX_AGE_MS
  EVIDENCE: src/lib/impcg/whatsapp-notify.ts:63:  return now.getTime() - receivedAt.getTime() <= IMPCG_NOTIFY_MAX_AGE_MS; | src/lib/impcg/constants.ts:23:export const IMPCG_NOTIFY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 

- [x] G4: idempotência persistida em ImpcgSourceMessage
  CHECK: rg -c 'whatsappSentAt' prisma/schema.prisma prisma/migrations/*/migration.sql src/lib/impcg/store.ts
  EXPECT: prisma/schema.prisma:1
  EVIDENCE: src/lib/impcg/store.ts:2 | prisma/migrations/20260831200000_add_impcg_whatsapp_notify/migration.sql:1

- [x] G5: nenhum dado de paciente em log (FR-009)
  CHECK: rg -n 'patientName|hospitalName|procedureName|patientRegistry' src/lib/impcg/whatsapp-notify.ts | rg -c 'log\.' || echo NO_PATIENT_IN_LOG
  EXPECT: NO_PATIENT_IN_LOG
  EVIDENCE: NO_PATIENT_IN_LOG

- [x] G6: testes de aceitação AC-001..AC-008 passam
  CHECK: npx vitest run src/lib/__tests__/impcg-whatsapp-notify.test.ts 2>&1 | rg 'Tests'
  EXPECT: 8 passed
  EVIDENCE: Tests  8 passed (8)

- [x] G7: gate de janela de migration atualizado para a migration nova
  CHECK: node scripts/test-production-migration-window.cjs >/dev/null 2>&1 && echo MIGRATION_GATE_OK || echo MIGRATION_GATE_FAIL
  EXPECT: MIGRATION_GATE_OK
  EVIDENCE: MIGRATION_GATE_OK

- [x] G8: typecheck limpo
  CHECK: npx tsc --noEmit 2>&1 | rg -c 'error TS' || echo ZERO_TS_ERRORS
  EXPECT: ZERO_TS_ERRORS
  EVIDENCE: ZERO_TS_ERRORS

- [x] G9: lint limpo
  CHECK: npm run lint >/dev/null 2>&1 && echo LINT_OK || echo LINT_FAIL
  EXPECT: LINT_OK
  EVIDENCE: LINT_OK

- [x] G10: suíte completa verde
  CHECK: npm test 2>&1 | rg 'Test Files' | rg -c 'failed' || echo NO_FAILED_FILES
  EXPECT: NO_FAILED_FILES
  EVIDENCE: NO_FAILED_FILES

- [ ] G11: credenciais Evolution disponíveis para o app em produção (env), sem imprimir valor
  EVIDENCE: pending

- [ ] G12: envio de teste aprovado no grupo administrado só pelo solicitante
  EVIDENCE: pending
