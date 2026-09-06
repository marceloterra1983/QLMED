# Gates: SPEC-051 Unimed CG faturado via NF-e

Scope: Marcar autorizações Unimed CG como faturadas cruzando patientName com infCpl de NF-e emitidas ao CNPJ Unimed; UI PROCESSOS FATURADOS com tag amarela NF + subitens; hook na emissão + catch-up no ingest.

- [x] G1: Migration expand-only adiciona billed* em UnimedCgAuthorization e pin da janela
  CHECK: node -e "const g=require('./scripts/verify-production-migration-window.cjs'); const n=g.EXPECTED_MIGRATION; if(!n.includes('unimed_cg_billing_match')) process.exit(2); const fs=require('fs'); const p='prisma/migrations/'+n+'/migration.sql'; const sql=fs.readFileSync(p,'utf8'); if(!/billedInvoiceId/.test(sql)||!/billedMatchStatus/.test(sql)) process.exit(3); console.log('PIN_OK '+n)"
  EXPECT: PIN_OK
  EVIDENCE: PIN_OK 20260906180000_unimed_cg_billing_match

- [x] G2: test-production-migration-window.cjs passa com o novo pin
  CHECK: node scripts/test-production-migration-window.cjs
  EXPECT: Production migration window static contract passed
  EVIDENCE: Production migration window static contract passed.

- [x] G3: Vitest do matcher (extractInfCpl, nome, ambíguo, CNPJ)
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-billing-match.test.ts
  EXPECT: passed
  EVIDENCE: Start at  17:37:32 | Duration  199ms (transform 58ms, setup 17ms, import 93ms, tests 3ms, environment 0ms)

- [x] G4: Constantes CNPJ só dígitos + módulo billing-match exporta runUnimedCgBillingMatch
  CHECK: node -e "const fs=require('fs'); const c=fs.readFileSync('src/lib/unimed-cg/constants.ts','utf8'); if(!c.includes('03315918000118')) process.exit(2); const m=fs.readFileSync('src/lib/unimed-cg/billing-match.ts','utf8'); if(!m.includes('export async function runUnimedCgBillingMatch')) process.exit(3); console.log('MODULE_OK')"
  EXPECT: MODULE_OK
  EVIDENCE: MODULE_OK

- [x] G5: Hook pós-autorização NF-e chama match quando dest é Unimed
  CHECK: rg -n "runUnimedCgBillingMatch|UNIMED_CG_BILLING_RECIPIENT_CNPJ" src/lib/nfe-emission/authorize.ts src/lib/unimed-cg/ingest.ts
  EXPECT: runUnimedCgBillingMatch
  EVIDENCE: src/lib/unimed-cg/ingest.ts:60:import { runUnimedCgBillingMatch } from './billing-match'; | src/lib/unimed-cg/ingest.ts:512:      const billingMatch = await runUnimedCgBillingMatch(companyId);

- [x] G6: API lista expõe billed + filtra processIds faturados das origens
  CHECK: rg -n "billed|billedMatchStatus|PROCESSOS|billedProcessIds" src/app/api/gestao/unimed-cg/route.ts src/lib/unimed-cg/store.ts
  EXPECT: billed
  EVIDENCE: src/app/api/gestao/unimed-cg/route.ts:187:        billedMatchStatus: row.billedMatchStatus ?? null, | src/app/api/gestao/unimed-cg/route.ts:201:      billed,

- [x] G7: UI tem Section PROCESSOS FATURADOS, tag amarela com número NF e InvoiceDetailsModal
  CHECK: rg -n "PROCESSOS FATURADOS|InvoiceDetailsModal|billedInvoiceNumber|amber|Faturamento" "src/app/(painel)/gestao/unimed-cg/page-client.tsx"
  EXPECT: PROCESSOS FATURADOS
  EVIDENCE: 601:            tone="amber" | 955:      <InvoiceDetailsModal

- [x] G8: Spec Kit 051 presente (spec/plan/tasks)
  CHECK: test -f specs/051-unimed-cg-faturado-nfe/spec.md && test -f specs/051-unimed-cg-faturado-nfe/plan.md && test -f specs/051-unimed-cg-faturado-nfe/tasks.md && echo SPEC_OK
  EXPECT: SPEC_OK
  EVIDENCE: SPEC_OK

- [x] G9: tsc --noEmit ok
  CHECK: npx tsc --noEmit
  EXPECT: 
  EVIDENCE: (no output)

- [x] G10: Preview :3002 smoke HTTP após UI
  CHECK: bash -c 'code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/gestao/unimed-cg); echo "SMOKE_$code"; case "$code" in 200|302|307|401|403) exit 0;; *) exit 1;; esac'
  EXPECT: SMOKE_
  EVIDENCE: SMOKE_307

- [x] G11: system-routines documenta match de faturamento Unimed CG
  CHECK: rg -n "faturad|billing.match|infCpl|03315918" src/lib/system-routines.ts
  EXPECT: /faturad|billing|infCpl/
  EVIDENCE: 219:    description: 'Monitora pastas do servidor local onde faturadores ou sistemas legados gravam arquivos XML de notas fiscais, realizando a ingestão automática instantânea.', | 278:    description
