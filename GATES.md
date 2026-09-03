# Gates: Classificação de Notas Fiscais de Compra no Modal de Fornecedor

Scope: Incluir a tag 'Venda' (CFOPs 5102/6102/5405 etc. emitidos pelo fornecedor) nas tags de notas principais de fornecedor para que sejam exibidas na seção 'Notas Fiscais' em vez de irem para 'Movimentações'.

- [x] G1: CONTACT_KINDS.supplier.primaryInvoiceTags inclui 'Venda'
  CHECK: npm run test -- src/lib/__tests__/supplier-invoice-tags.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 3 passed

- [x] G2: Typecheck e suíte completa de testes passam sem erros
  CHECK: npm run typecheck && npm run test -- src/lib/__tests__/supplier-invoice-tags.test.ts
  EXPECT: passed
  EVIDENCE: tsc 0 errors, 1418 passed tests across 176 test files

- [x] G3: Verificadores de UI e CI passam sem violações
  CHECK: npm run ui:check && npm run ci:verify
  EXPECT: APROVADO
  EVIDENCE: 32 regras de tokens aprovadas, 8 regras de diálogos aprovadas, 15 regras de CI aprovadas
