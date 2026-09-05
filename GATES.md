# Gates: Árvore completa do catálogo em /cadastro/produtos (sem paginação na hierarquia)

Scope: Ordenação hierárquica (`sortBy === 'productType'`) carrega TODO o catálogo filtrado (`exportAll=true`), monta árvore Linha > Grupo > Subgrupo > Produto renderizando só nós visíveis; ordenações flat continuam paginadas (50). Preview :3002 + PR/merge/deploy.

- [ ] G1: page-client envia `exportAll=true` (sem page/limit) na hierarquia e mantém page/limit nas ordenações flat
  CHECK: rg -n "exportAll|isTreeView" "src/app/(painel)/cadastro/produtos/page-client.tsx" 2>&1 | head -20
  EXPECT: /exportAll/
  EVIDENCE: pending

- [ ] G2: ProductTable monta árvore memoizada (Linha > Grupo > Subgrupo > produtos) e só renderiza filhos de nós expandidos
  CHECK: rg -n "buildProductTree|useMemo" "src/app/(painel)/cadastro/produtos/components/ProductTable.tsx" "src/app/(painel)/cadastro/produtos/components/product-tree.ts" 2>&1 | head -20
  EXPECT: /buildProductTree/
  EVIDENCE: pending

- [ ] G3: Expandir/busca não estouram DOM: acima de `FULL_EXPAND_LIMIT` produtos abrem só até o último nível de agrupamento (leafCollapseKeys)
  CHECK: rg -n "FULL_EXPAND_LIMIT|expandCollapseKeys|leafCollapseKeys" "src/app/(painel)/cadastro/produtos/components/product-group-visibility.ts" "src/app/(painel)/cadastro/produtos/page-client.tsx" "src/app/(painel)/cadastro/produtos/components/ProductTable.tsx" 2>&1 | head -20
  EXPECT: /FULL_EXPAND_LIMIT/
  EVIDENCE: pending

- [ ] G4: Testes vitest de produtos (tree, visibility, ProductTable, contrato, rota list) verdes
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run "src/app/(painel)/cadastro/produtos" src/lib/__tests__/produtos-groups-expanded-contract.test.ts src/lib/__tests__/products-list-visibility.test.ts --reporter=dot 2>&1 | tail -8
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: pending

- [ ] G5: Typecheck e lint limpos
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit > /tmp/g5-tsc.log 2>&1; echo TSC:$?; tail -3 /tmp/g5-tsc.log; npx eslint "src/app/(painel)/cadastro/produtos" src/app/api/products/list src/lib/__tests__/produtos-groups-expanded-contract.test.ts > /tmp/g5-lint.log 2>&1; echo LINT:$?; tail -3 /tmp/g5-lint.log
  EXPECT: /TSC:0[\s\S]*LINT:0/
  EVIDENCE: pending

- [ ] G6: Preview :3002 serve o tip da branch e /cadastro/produtos mostra TODAS as linhas (CARDIACA 826, CRM 97, EQUIPAMENTOS 107, HEMODINAMICA 2999, ORTOPEDIA 3671, OUTROS 234, Sem linha 31) recolhidas, rodapé "7.965 produtos no cadastro" sem "página 1 de 160"
  EVIDENCE: pending

- [ ] G7: API `/api/products/list?sort=productType&exportAll=true` no preview responde 7965 produtos em tempo aceitável (< 3 s) e payload gzip medido
  EVIDENCE: pending

- [ ] G8: Spec 043 atualizada (FR de listagem hierárquica sem paginação)
  CHECK: rg -n "FR-012" specs/043-spica-product-import/spec.md 2>&1 | head -3
  EXPECT: /FR-012/
  EVIDENCE: pending

- [ ] G9: PR mergeado + CI main verde + deploy produção health com SHA novo
  EVIDENCE: pending
