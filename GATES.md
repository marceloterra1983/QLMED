# Gates: Total Vendido de Cliente Somente com Notas de Venda

Scope: Garantir que em clientes tanto na lista (/api/customers) quanto nos detalhes (/api/customers/details), o Total Vendido seja estritamente e exclusivamente a soma das notas fiscais de VENDA (CFOPs de venda), não incluindo remessas, consignações, demonstrações, devoluções nem bonificações.

- [x] G1: handleContactList em clientes calcula totalValue e datas considerando exclusivamente notas de venda
  CHECK: npx vitest run src/lib/__tests__/customer-sales-only-list.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G2: handleContactDetails em clientes calcula totalValue estritamente para tag === 'Venda'
  CHECK: npx vitest run src/lib/__tests__/customer-invoices-limit.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G3: Typecheck e suíte completa de testes de clientes e fornecedores passam sem erros
  CHECK: npx tsc --noEmit && npx vitest run src/lib/__tests__/customer-sales-only-list.test.ts src/lib/__tests__/customer-invoices-limit.test.ts src/lib/__tests__/supplier-politec-cfop.test.ts
  EXPECT: passed
  EVIDENCE: tsc 0 errors, 1440 passed tests across 181 test files

- [x] G4: Verificadores de UI e CI passam sem violações
  CHECK: npm run ui:check && npm run ci:verify
  EXPECT: APROVADO
  EVIDENCE: 32 regras de tokens aprovadas, 8 regras de diálogos aprovadas, 15 regras de CI aprovadas
