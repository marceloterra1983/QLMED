# Gates: daily-summary idempotency fix

Scope: Corrigir marcador/idempotência e catch-up 403 pós-aposentadoria n8n.

- [ ] G1: state dir do job usa /app/storage (gravável no container)
  CHECK: rg -n "app/storage|DAILY_SUMMARY_STATE_DIR" src/lib/daily-issued-summary-job.ts | head -5
  EXPECT: /app/storage
  EVIDENCE: pending

- [ ] G2: catch-up reconhece sent_ e sent-
  CHECK: rg -n "sent_\\$\{|sent-\\$\{" ops/scripts/qlmed-daily-summary-catchup.sh
  EXPECT: sent_
  EVIDENCE: pending

- [ ] G3: unit systemd aponta app.env (não n8n.env)
  CHECK: rg -n "app.env|n8n.env" ops/systemd/qlmed-daily-summary-catchup.service
  EXPECT: app.env
  EVIDENCE: pending

- [ ] G4: testes job + tsc
  CHECK: npm test -- --run src/lib/__tests__/daily-issued-summary-job.test.ts 2>&1 | tail -8
  EXPECT: /passed/
  EVIDENCE: pending
