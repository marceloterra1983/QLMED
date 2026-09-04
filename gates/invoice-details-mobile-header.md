# Gates: InvoiceDetailsModal mobile header

Scope: Empilhar título e controles (DANFE/XML/PDF/Imprimir) no mobile para não esmagar o título.

- [x] G1: Header do InvoiceDetailsModal usa empilhamento mobile
  CHECK: rg -n "flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3" src/components/InvoiceDetailsModal.tsx
  EXPECT: flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3
  EVIDENCE: 254:          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">

- [x] G2: Título não usa shrink-0 na coluna esquerda (permite truncar)
  CHECK: rg -n "flex items-center gap-2 sm:gap-3 min-w-0" src/components/InvoiceDetailsModal.tsx
  EXPECT: min-w-0
  EVIDENCE: 256:            <div className="flex items-center gap-2 sm:gap-3 min-w-0">

- [x] G3: Teste de render cobre o empilhamento
  CHECK: ./node_modules/.bin/vitest run src/components/__tests__/InvoiceDetailsModal.render.test.tsx 2>&1 | tail -30
  EXPECT: /passed|✓/
  EVIDENCE: Test Files 1 passed (1); Tests 3 passed (3)

- [x] G4: Preview canônico responde autenticado em produtos
  CHECK: curl -s -o /dev/null -w "%{http_code}" -b /tmp/qlmed-smoke-cookies.txt http://127.0.0.1:3002/cadastro/produtos
  EXPECT: 200
  EVIDENCE: 200

- [x] G5: Smoke mobile InvoiceDetailsModal sem overflow horizontal no header
  EVIDENCE: Playwright 390x844 em :3002; flexDirection=column; headerScroll=390=headerClient; dialogOverflow=false; shot /tmp/qlmed-mobile-smoke/invoice-header.png
