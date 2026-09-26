# Gates: lentidão vps2 (steal + Unimed Chromium)

Scope: parar o loop de Puppeteer que reconsulta forever as mesmas pré-solicitações sem Beneficiário, e tirar sync OneDrive do GET /api/invoices.

- [x] G1: miss do portal persiste marcador e não reconsulta
  CHECK: npx vitest run src/lib/__tests__/unimed-cg-patient-name-backfill.test.ts 2>&1 | tail -25
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: 2026-09-19 — 3 passed (incl. marcador "—"); Chromium lazy via fetchBeneficiarioViaOpme

- [x] G2: GET invoices issued não chama ensureLocalXmlSyncNow
  CHECK: npx vitest run src/lib/__tests__/invoices-route-no-forced-sync.test.ts 2>&1 | tail -25
  EXPECT: /Test Files\s+1 passed/
  EVIDENCE: 2026-09-19 — ensureLocalXmlSyncNow not.toHaveBeenCalled

- [x] G3: typecheck do recorte
  CHECK: npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: /TSC_OK/
  EVIDENCE: 2026-09-19 — TSC_EXIT:0
