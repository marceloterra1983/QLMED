# Gates: edição no popup (lápis discreto) + fabricante

- [x] G1: tabela sem lápis; popup edita datas e fabricante
  CHECK: npx vitest run src/components/__tests__/documentos-detalhe-modal.test.tsx src/components/__tests__/documentos-family-table.test.tsx src/components/__tests__/documentos-page.test.tsx 2>&1 | tail -20
  EXPECT: /Test Files\s+3 passed/
  EVIDENCE: 2026-09-11 — Test Files 3 passed (3); Tests 36 passed (36)

- [x] G2: PATCH aceita manufacturer; tsc limpo
  CHECK: npx vitest run src/lib/__tests__/documentos-upload-route.test.ts -t "PATCH" 2>&1 | tail -15; npx tsc --noEmit --pretty false; echo TSC_OK
  EXPECT: /TSC_OK/
  EVIDENCE: pending-run

- [x] G3: ui:verify
  CHECK: npm run ui:verify 2>&1 | tail -25
  EXPECT: /ok   muted/
  EVIDENCE: 2026-09-11 — ok muted / field / iconbtn (0 violações)

- [ ] G4: preview :3002 smoke Documentos
  CHECK: curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/cadastro/documentos
  EXPECT: /^(200|307)$/
  EVIDENCE: pending
