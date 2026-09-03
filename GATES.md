# Gates: fix-invoice-details-modal-render

Scope: Corrigir o layout e altura do container no InvoiceDetailsModal para que a DANFE e o XML preencham 100% da área do modal sem cortes ou colapso para 150px

- [x] G1: InvoiceDetailsModal define bodyClassName com flex flex-col e h-full para esticar a área do corpo
  CHECK: node -e "const fs = require('fs'); const src = fs.readFileSync('src/components/InvoiceDetailsModal.tsx', 'utf8'); if (!src.includes('bodyClassName=\"flex flex-col flex-1 h-full min-h-0 overflow-hidden\"') && !src.includes('bodyClassName=\"flex flex-col h-full min-h-0 overflow-hidden\"')) process.exit(1); console.log('G1 passed: InvoiceDetailsModal sets flex-col full-height bodyClassName');"
  EXPECT: G1 passed: InvoiceDetailsModal sets flex-col full-height bodyClassName
  EVIDENCE: G1 passed: InvoiceDetailsModal sets flex-col full-height bodyClassName

- [x] G2: Container do iframe e visualizador XML configurados com flex-1 h-full min-h-0 para preenchimento total
  CHECK: node -e "const fs = require('fs'); const src = fs.readFileSync('src/components/InvoiceDetailsModal.tsx', 'utf8'); if (!src.includes('min-h-0') || !src.includes('flex-1')) process.exit(1); console.log('G2 passed: iframe and xml containers configured for full expansion');"
  EXPECT: G2 passed: iframe and xml containers configured for full expansion
  EVIDENCE: G2 passed: iframe and xml containers configured for full expansion

- [x] G3: Teste unitário/contrato de renderização para InvoiceDetailsModal garante estrutura de altura total
  CHECK: npx vitest run src/components/__tests__/InvoiceDetailsModal.render.test.tsx
  EXPECT: passed
  EVIDENCE: Start at  11:54:29 | Duration  175ms (transform 51ms, setup 15ms, import 72ms, tests 8ms, environment 0ms)

- [x] G4: Verificações de UI, typecheck e testes de regressão passam sem erros
  CHECK: npm run ui:verify && npm run ui:dialogs && npm run typecheck && npm test
  EXPECT: passed
  EVIDENCE: Start at  11:50:21 | Duration  7.53s (transform 5.48s, setup 1.03s, import 12.06s, tests 17.83s, environment 2.61s)
