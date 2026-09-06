# Gates: SPEC-051 faturados ambíguos (PO feedback)

Scope: Ambíguos (1 processId ↔ N NF-e) entram em PROCESSOS FATURADOS destacados com tags NF candidatas; processIds matched|ambiguous saem das origens; match continua por processId (mesmo patientName em processos distintos é OK).

- [x] G1: Migration expand-only `billedCandidateInvoices` Json + pin janela produção
  CHECK: node -e "const g=require('./scripts/verify-production-migration-window.cjs'); const n=g.EXPECTED_MIGRATION; if(!n.includes('unimed_cg_billing_ambiguous')) process.exit(2); const fs=require('fs'); const sql=fs.readFileSync('prisma/migrations/'+n+'/migration.sql','utf8'); if(!/billedCandidateInvoices/.test(sql)) process.exit(3); console.log('PIN_OK '+n)"
  EXPECT: PIN_OK
  EVIDENCE: PIN_OK 20260906200000_unimed_cg_billing_ambiguous_candidates

- [x] G2: test-production-migration-window.cjs passa com o novo pin
  CHECK: node scripts/test-production-migration-window.cjs
  EXPECT: Production migration window static contract passed
  EVIDENCE: Production migration window static contract passed.

- [x] G3: Vitest: unique→matched; multi-NF→ambiguous com candidatos; dois processIds mesmo nome cada NF única→ambos matched
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-billing-match.test.ts
  EXPECT: passed
  EVIDENCE: Start at  18:10:12 | Duration  219ms (transform 66ms, setup 19ms, import 106ms, tests 4ms, environment 0ms)

- [x] G4: billing-match persiste candidatos no status ambiguous e limpa no matched
  CHECK: rg -n "billedCandidateInvoices" src/lib/unimed-cg/billing-match.ts
  EXPECT: billedCandidateInvoices
  EVIDENCE: 166:          billedCandidateInvoices: serializeBilledCandidates(decision.invoices), | 184:        billedCandidateInvoices: Prisma.DbNull,

- [x] G5: store/API incluem matched|ambiguous em billed e filtram origens por ambos
  CHECK: rg -n "isUnimedCgBilledStatus|billedCandidateInvoices|matched', 'ambiguous" src/lib/unimed-cg/store.ts src/app/api/gestao/unimed-cg/route.ts
  EXPECT: billedCandidateInvoices
  EVIDENCE: src/lib/unimed-cg/store.ts:104:    where: { companyId, billedMatchStatus: { in: ['matched', 'ambiguous'] } }, | src/lib/unimed-cg/store.ts:134:    billedCandidateInvoices: parseBilledCandidates(row.bi

- [x] G6: UI Faturados destaca Ambíguo + múltiplas tags NF candidatas + modal
  CHECK: rg -n "isAmbiguous|billedCandidateInvoices|Ambíguo" "src/app/(painel)/gestao/unimed-cg/page-client.tsx"
  EXPECT: billedCandidateInvoices
  EVIDENCE: 409:                      {isAmbiguous ? ( | 411:                          Ambíguo

- [x] G7: SPEC-051 emendada (ambíguos em Faturados; ambiguidade = multi-NF por processId)
  CHECK: rg -n "billedCandidateInvoices|múltiplas NF-e" specs/051-unimed-cg-faturado-nfe/spec.md
  EXPECT: billedCandidateInvoices
  EVIDENCE: 34:- Persistência expand-only em `UnimedCgAuthorization`: `billedInvoiceId`, `billedInvoiceNumber`, `billedMatchedAt`, `billedMatchStatus` (`matched` | `ambiguous` | null), `billedCandidateInvoices` (

- [x] G8: tsc --noEmit ok
  CHECK: npx tsc --noEmit
  EXPECT:
  EVIDENCE: (no output)

- [x] G9: Preview :3002 smoke HTTP após UI
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/gestao/unimed-cg
  EXPECT: 307
  EVIDENCE: 307
