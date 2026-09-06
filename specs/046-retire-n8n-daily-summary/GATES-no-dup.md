# Gates: daily-summary no duplicates

Scope: Impedir reenvio do Resumo do Dia (preview+prod) e torná-lo idempotente no Postgres.

- [x] G1: Preview starter desliga native + background
  CHECK: rg -n "DAILY_SUMMARY_NATIVE: .0.|QLMED_DISABLE_BACKGROUND_SERVICES: .true." ops/scripts/qlmed-dev-preview-starter.mjs
  EXPECT: /DAILY_SUMMARY_NATIVE/
  EVIDENCE: starter sets DAILY_SUMMARY_NATIVE: '0' and QLMED_DISABLE_BACKGROUND_SERVICES: 'true'

- [x] G2: Job recusa NEXTAUTH_URL de preview
  CHECK: npx vitest run src/lib/__tests__/daily-issued-summary-job.test.ts 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: vitest: 8 passed (daily-issued-summary-job.test.ts)

- [x] G3: Claim Postgres — segundo envio same day = already_sent
  CHECK: npx vitest run src/lib/__tests__/daily-issued-summary-job.test.ts 2>&1 | rg -n "already_sent|passed|FAIL"
  EXPECT: /passed/
  EVIDENCE: vitest includes already_sent claim + 8 passed

- [x] G4: Lock fail-closed + sender gate
  CHECK: rg -n "lock_not_acquired|tryClaimDailySummarySend|isDailySummarySenderAllowed" src/lib/daily-issued-summary-job.ts
  EXPECT: /isDailySummarySenderAllowed/
  EVIDENCE: isDailySummarySenderAllowed + tryClaimDailySummarySend + lock_not_acquired present

- [x] G5: Migration pinada
  CHECK: rg -n "daily_issued_summary_send" scripts/verify-production-migration-window.cjs prisma/migrations/*/migration.sql
  EXPECT: /daily_issued_summary_send/
  EVIDENCE: migration 20260906150000 + pin in verify-production-migration-window.cjs

- [x] G6: SPEC-046 documenta prod-only + claim DB
  CHECK: rg -n "prod-only|Postgres|NEXTAUTH_URL|isDailySummarySenderAllowed" specs/046-retire-n8n-daily-summary/spec.md
  EXPECT: /NEXTAUTH_URL|Postgres/
  EVIDENCE: SPEC-046 AC-004/FR-006/FR-007 prod-only + Postgres claim
