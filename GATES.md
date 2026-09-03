# Gates: Correção de Banco de Dados, Ingestão e Visibilidade de Dados

Scope: Correções de carregamento e visibilidade de dados no app QLMED (produtos sem agregados, anos históricos dinâmicos, NFS-e emitidas, ingestão de duplicatas e otimização relacional).

- [x] G1: Catálogo de produtos não esconde itens sem `aggComputedAt`
  CHECK: npm run test -- src/lib/__tests__/products-list-visibility.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G2: Rota dinâmica de anos fiscais `/api/invoices/years` responde anos com documentos reais
  CHECK: npm run test -- src/lib/__tests__/invoices-years-route.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 3 passed

- [x] G3: Telas fiscais usam busca dinâmica de anos (sem limitação cega de 4 anos)
  CHECK: npm run test -- src/lib/__tests__/dynamic-years-contract.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G4: Visibilidade de NFS-e permite direção `all`, `received` e `issued` sem ocultar notas de prestação
  CHECK: npm run test -- src/lib/__tests__/nfse-direction-visibility.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 4 passed

- [x] G5: Ingestão de NF-e persiste duplicatas e totais fiscais de forma síncrona
  CHECK: npm run test -- src/lib/__tests__/sync-enrichment-duplicatas.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 2 passed

- [x] G6: Script de backfill CLI durável de duplicatas processa notas pendentes com cursor e limite
  CHECK: npm run test -- src/lib/__tests__/backfill-duplicatas-cli.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 3 passed

- [x] G7: Consulta de duplicatas do financeiro não passa lista massiva de IDs em `IN (...)`
  CHECK: npm run test -- src/lib/__tests__/financeiro-duplicatas-relational.test.ts
  EXPECT: passed
  EVIDENCE: Test Files 1 passed, Tests 1 passed

- [x] G8: Typecheck e suíte completa de testes do projeto verdes
  CHECK: npm run typecheck && npm run test
  EXPECT: passed
  EVIDENCE: tsc --noEmit 0 errors, 1414 passed tests across 175 test files

- [x] G9: Verificadores de UI e CI passam sem violações
  CHECK: npm run ui:check && npm run ci:verify
  EXPECT: APROVADO
  EVIDENCE: 32 regras de tokens aprovadas, 8 regras de diálogos aprovadas, 15 regras de CI aprovadas
