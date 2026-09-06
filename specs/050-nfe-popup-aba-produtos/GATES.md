# Gates: NF-e popup abre na aba Produtos

Scope: Ao clicar na linha de NF-e recebidas ou emitidas, o NfeDetailsModal abre com a aba Produtos selecionada.

- [x] G1: Default do modal e openDetails apontam para produtos
  CHECK: rg -n "initialTab \|\| 'produtos'|useState\('produtos'\)|setDetailsInitialTab\('produtos'\)" src/components/NfeDetailsModal.tsx "src/app/(painel)/fiscal/invoices/page-client.tsx" "src/app/(painel)/fiscal/issued/page-client.tsx" | wc -l
  EXPECT: /[4-9]/
  EVIDENCE: wc -l → 6

- [x] G2: Teste de abas exige Produtos selecionada
  CHECK: npx vitest run src/components/__tests__/NfeDetailsModal.tabs.test.tsx 2>&1 | grep -E "Tests |Test Files" | head -2
  EXPECT: /Tests\s+\d+ passed/
  EVIDENCE: Test Files 1 passed (1); Tests 1 passed (1)

- [x] G3: Spec Kit 049 presente e docs:validate verde
  CHECK: npm run docs:validate 2>&1 | tail -5
  EXPECT: /passed/i
  EVIDENCE: Documentation validation passed (218 Markdown files, 60 IDs).
