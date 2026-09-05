# Gates: retire-n8n-daily-summary

Scope: Resumo diário NF-e nativo no app; aposentar workflows n8n QLMED e superfície Automações.

- [x] G1: SPEC-046 existe com FR/AC do resumo nativo e aposentadoria n8n
  CHECK: test -f specs/045-retire-n8n-daily-summary/spec.md && rg -q "status: approved" specs/045-retire-n8n-daily-summary/spec.md
  EXPECT: status: approved
  EVIDENCE: specs/045-retire-n8n-daily-summary/spec.md status: approved

- [x] G2: Montagem da mensagem WhatsApp portada com testes
  CHECK: npm test -- --run src/lib/__tests__/daily-issued-summary-message.test.ts src/lib/__tests__/daily-issued-summary.test.ts 2>&1 | tail -15
  EXPECT: /passed/
  EVIDENCE: Test Files 7 passed; message+summary suites green

- [x] G3: sendWhatsAppText + job runDailyIssuedSummary com idempotência e dry-run
  CHECK: npm test -- --run src/lib/__tests__/daily-issued-summary-job.test.ts src/lib/__tests__/whatsapp-evolution-text.test.ts 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: job+text suites green (44 tests in focused pack)

- [x] G4: Catch-up systemd não chama n8n
  CHECK: (rg -q "N8N_|webhook/qlmed-daily" ops/scripts/qlmed-daily-summary-catchup.sh && echo STILL) || echo NO_N8N; rg -q "daily-issued-summary" ops/scripts/qlmed-daily-summary-catchup.sh && echo HAS_NATIVE
  EXPECT: HAS_NATIVE
  EVIDENCE: NO_N8N_CATCHUP + HAS_NATIVE

- [x] G5: Catálogo Rotinas sem n8n-stuck; daily-summary aponta módulo app
  CHECK: (rg -q "n8n-stuck-watchdog" src/lib/system-routines.ts && echo STILL_STUCK) || echo NO_STUCK
  EXPECT: NO_STUCK
  EVIDENCE: NO_STUCK; sourceModule daily-issued-summary-job.ts

- [x] G6: Automações removida da navegação
  CHECK: (rg -q "Automações|/sistema/automacoes" src/lib/navigation.ts && echo STILL_NAV) || echo NO_NAV
  EXPECT: NO_NAV
  EVIDENCE: NO_NAV

- [x] G7: Compose sem serviços qlmed-n8n / n8n-db
  CHECK: (rg -q "^\\s+qlmed-n8n:|^\\s+n8n-db:" ops/compose/qlmed-stack.yml && echo STILL) || echo NO_COMPOSE_N8N
  EXPECT: NO_COMPOSE_N8N
  EVIDENCE: NO_COMPOSE

- [x] G8: Typecheck + docs:validate
  CHECK: npx tsc --noEmit; npm run docs:validate
  EXPECT: /
  EVIDENCE: tsc exit 0; docs:validate passed (207 Markdown files)

- [ ] G9: Workflows n8n pausados / stack desligada no host
  EVIDENCE: pending (após deploy: deactivate + docker stop)
