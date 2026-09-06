# Gates: SPEC-054 convenio + médico na NF-e emitida

Scope: Extrair e persistir `convenioName`/`doctorName` do `infCpl` (como `patientName`), backfill, e coluna Paciente empilhada (convênio → paciente → médico muted).

- [x] G1: Extrator lê `(Convenio …)` e `(Medico …)` do infCpl; rejeita `Medico -` / vazio
  CHECK: cd /home/marce/qlmed/.worktrees/053-nfe-convenio-medico && npx vitest run src/lib/__tests__/extract-patient-name.test.ts 2>&1 | tail -25
  EXPECT: /passed/
  EVIDENCE: Start at  19:31:54 | Duration  153ms (transform 43ms, setup 20ms, import 35ms, tests 5ms, environment 0ms)

- [x] G2: Migration pinada na janela de produção
  CHECK: cd /home/marce/qlmed/.worktrees/053-nfe-convenio-medico && node -e "const g=require('./scripts/verify-production-migration-window.cjs'); const names=g.EXPECTED_MIGRATIONS.map(m=>m.name).join(','); if(!names.includes('invoice_convenio_doctor')) { console.error('missing pin'); process.exit(1);} console.log('PIN_OK', g.EXPECTED_MIGRATION);" && node scripts/test-production-migration-window.cjs 2>&1 | tail -20
  EXPECT: /PIN_OK/
  EVIDENCE: PIN_OK 20260906220000_invoice_convenio_doctor | Production migration window static contract passed.

- [x] G3: API + types + write fields expõem convenioName e doctorName
  CHECK: cd /home/marce/qlmed/.worktrees/053-nfe-convenio-medico && rg -n "convenioName|doctorName" src/app/api/invoices/route.ts src/types/index.ts src/lib/nfe/invoice-patient-fields.ts | head -20
  EXPECT: /convenioName/
  EVIDENCE: src/app/api/invoices/route.ts:287:          { convenioName: { contains: word, mode: 'insensitive' as const } }, | src/app/api/invoices/route.ts:288:          { doctorName: { contains: word, mode: 'ins

- [x] G4: UI emitidas empilha convênio / paciente / médico muted
  CHECK: cd /home/marce/qlmed/.worktrees/053-nfe-convenio-medico && rg -n "convenioName|doctorName" 'src/app/(painel)/fiscal/issued/page-client.tsx' | head -25
  EXPECT: /doctorName/
  EVIDENCE: 349:            {invoice.doctorName ? ( | 350:              <p className="truncate text-xs leading-tight text-slate-500 dark:text-slate-400">{invoice.doctorName}</p>

- [x] G5: tsc limpo
  CHECK: cd /home/marce/qlmed/.worktrees/053-nfe-convenio-medico && npx tsc --noEmit && echo TSC_OK
  EXPECT: /TSC_OK/
  EVIDENCE: TSC_OK

- [x] G6: Preview HTTP responde em :3002
  CHECK: curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/fiscal/issued
  EXPECT: /200|307|302/
  EVIDENCE: 307
