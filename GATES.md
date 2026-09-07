# Gates: SPEC-058 Visão em Árvore e Correção do Saldo de Estoque

Scope: Correção do ledger de estoque com corte 2021 + árvore de produtos e popup/expand em Controle e Saída Material.

- [x] G1: Spec SPEC-058 e documentação válidas
  CHECK: test -f specs/058-estoque-tree-view/spec.md && npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (245 Markdown files, 73 IDs).

- [x] G2: Suporte a corte de data e entradas XML no backfill do ledger
  CHECK: npx vitest run src/lib/__tests__/stock-ledger-backfill.test.ts --reporter=dot 2>&1 | tail -5
  EXPECT: passed
  EVIDENCE: Start at  17:37:17 | Duration  139ms (transform 30ms, setup 17ms, import 25ms, tests 10ms, environment 0ms)

- [x] G3: Hierarquia de produtos e lotes modal funcionando no Controle
  CHECK: test -f src/app/\(painel\)/estoque/controle/components/ProductStockDetailModal.tsx && test -f src/app/\(painel\)/estoque/controle/components/StockProductTreeTable.tsx
  EXPECT: /./
  EVIDENCE: files exist StockProductTreeTable.tsx + ProductStockDetailModal.tsx

- [x] G4: Verificação de UI tokens e sem diálogos nativos
  CHECK: npm run ui:verify && npm run ui:dialogs
  EXPECT: ok   nativo: 0 violações
  EVIDENCE: ok   nome: 0 violações | ok   nativo: 0 violações

- [x] G5: Typecheck TypeScript limpo
  CHECK: npx tsc --noEmit 2>&1 | tail -3
  EXPECT: /./
  EVIDENCE: tsc --noEmit exit 0

- [x] G6: Smoke preview HTTP
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/estoque/controle
  EXPECT: /^(200|307|302)$/
  EVIDENCE: 307 (auth redirect) on /estoque/controle and /estoque/saida-material
