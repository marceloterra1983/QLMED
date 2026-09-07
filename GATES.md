# Gates: SPEC-058 Visão em Árvore e Correção do Saldo de Estoque

Scope: Correção do ledger de estoque com corte 2021 + árvore de produtos e popup/expand em Controle e Saída Material.

- [ ] G1: Spec SPEC-058 e documentação válidas
  CHECK: test -f specs/058-estoque-tree-view/spec.md && npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: pending

- [ ] G2: Suporte a corte de data e entradas XML no backfill do ledger
  CHECK: npx vitest run src/lib/__tests__/stock-ledger-backfill.test.ts --reporter=dot 2>&1 | tail -5
  EXPECT: passed
  EVIDENCE: pending

- [ ] G3: Hierarquia de produtos e lotes modal funcionando no Controle
  CHECK: test -f src/app/\(painel\)/estoque/controle/components/ProductStockDetailModal.tsx && test -f src/app/\(painel\)/estoque/controle/components/StockProductTreeTable.tsx
  EXPECT: /./
  EVIDENCE: pending

- [ ] G4: Verificação de UI tokens e sem diálogos nativos
  CHECK: npm run ui:verify && npm run ui:dialogs
  EXPECT: ok   nativo: 0 violações
  EVIDENCE: pending

- [ ] G5: Typecheck TypeScript limpo
  CHECK: npx tsc --noEmit 2>&1 | tail -3
  EXPECT: /./
  EVIDENCE: pending

- [ ] G6: Smoke preview HTTP
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/estoque/controle
  EXPECT: /^(200|307|302)$/
  EVIDENCE: pending
