# Gates: Mapeamento de CFOP 6106 e Vendas de Fornecedores

Scope: Mapear CFOP 6106 e correlatos de venda no cfop.ts e garantir que as notas da Politec e de fornecedores com operações de venda recebam a tag 'Venda' e sejam exibidas na seção de Notas Fiscais.

- [x] G1: getCfopTagByCode('6106') devolve 'Venda' e getCfopCodesByTag('Venda') inclui '6106'
  CHECK: npm run test -- src/lib/__tests__/cfop.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 16 passed

- [x] G2: Notas da Politec com CFOP 6106 são classificadas com cfopTag 'Venda' e caem em primaryInvoices
  CHECK: npm run test -- src/lib/__tests__/supplier-politec-cfop.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 3 passed

- [x] G3: Typecheck e suíte completa de testes passam sem erros
  CHECK: npm run typecheck && npm run test -- src/lib/__tests__/cfop.test.ts src/lib/__tests__/supplier-politec-cfop.test.ts
  EXPECT: passed
  EVIDENCE: tsc 0 errors, 1422 passed tests across 177 test files

- [x] G4: Verificadores de UI e CI passam sem violações
  CHECK: npm run ui:check && npm run ci:verify
  EXPECT: APROVADO
  EVIDENCE: 32 regras de tokens aprovadas, 8 regras de diálogos aprovadas, 15 regras de CI aprovadas
