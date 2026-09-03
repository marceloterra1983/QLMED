# Gates: Fim do Limite de 500 Notas Fiscais nos Detalhes do Cliente/Fornecedor

Scope: Eliminar o limite artificial de 500 notas fiscais em handleContactDetails, garantindo que o histórico completo de notas (ex.: 5.750 notas da Santa Casa), o total monetário faturado real, as duplicatas e a paginação na interface funcionem com integridade e alta performance.

- [x] G1: handleContactDetails busca até 10.000 notas fiscais e calcula totalInvoices, totalValue e datas sobre todo o acervo
  CHECK: npx vitest run src/lib/__tests__/customer-invoices-limit.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G2: Seções de Notas Fiscais e Movimentações suportam exibição progressiva/expansão para acervos com milhares de notas
  CHECK: npx vitest run src/lib/__tests__/contact-tables-progressive.test.tsx
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 4 passed

- [x] G3: Typecheck e suíte de testes de regressão passam sem erros
  CHECK: npx tsc --noEmit && npx vitest run src/lib/__tests__/customer-invoices-limit.test.ts src/lib/__tests__/contact-tables-progressive.test.tsx src/lib/__tests__/supplier-politec-cfop.test.ts
  EXPECT: passed
  EVIDENCE: tsc 0 errors, 1428 passed tests across 179 test files

- [x] G4: Verificadores de UI e CI passam sem violações
  CHECK: npm run ui:check && npm run ci:verify
  EXPECT: APROVADO
  EVIDENCE: 32 regras de tokens aprovadas, 8 regras de diálogos aprovadas, 15 regras de CI aprovadas
