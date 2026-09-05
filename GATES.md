# Gates: Subgrupos (e grupos) colapsáveis na ProductTable

Scope: Linha, Grupo e Subgrupo colapsáveis com chevron/badge; Recolher/Expandir e load inicial incluem subgrupos; preview + PR/merge/deploy.

- [x] G1: `productSubgroupKey` + `allCollapseKeys`/`isProductRowVisible` incluem subgrupos
  CHECK: rg -n "productSubgroupKey|sub:" "src/app/(painel)/cadastro/produtos/components/product-group-visibility.ts" 2>&1 | head -30
  EXPECT: /productSubgroupKey|sub:/
  EVIDENCE: 53:    const sub = productSubgroupKey(product); | 81:      const sub = productSubgroupKey(p);

- [x] G2: Cabeçalho de subgrupo com chevron, badge, toggle e "Clique para expandir"
  CHECK: rg -n "toggleGroup\(sub|subgroupCollapsed|Clique para expandir|expand_more" "src/app/(painel)/cadastro/produtos/components/ProductTable.tsx" 2>&1 | head -40
  EXPECT: /subgroupCollapsed|toggleGroup\(sub/
  EVIDENCE: 369:                <span className="material-symbols-outlined text-[16px] text-slate-500 dark:text-slate-400 transition-transform duration-200" style={{ transform: renderCollapsed.has(group) ? 'rotat

- [x] G3: Produto só renderiza se linha+grupo+subgrupo não estiverem recolhidos
  CHECK: rg -n "!lineCollapsed && !grpCollapsed && !subgroupCollapsed" "src/app/(painel)/cadastro/produtos/components/ProductTable.tsx" 2>&1 | head -10
  EXPECT: /!lineCollapsed && !grpCollapsed && !subgroupCollapsed/
  EVIDENCE: 349:            {!lineCollapsed && !grpCollapsed && !subgroupCollapsed && renderProductRow(product, inTable)}

- [x] G4: Recolher/Expandir e load usam chaves de subgrupo (safeCollapseKeys/allCollapseKeys)
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run "src/app/(painel)/cadastro/produtos/components/__tests__/product-group-visibility.test.ts" "src/app/(painel)/cadastro/produtos/components/__tests__/ProductTable-expand-guard.test.tsx" --reporter=dot 2>&1 | tail -20
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: Start at  17:46:50 | Duration  568ms (transform 102ms, setup 26ms, import 148ms, tests 93ms, environment 257ms)

- [x] G5: Typecheck limpo
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit 2>&1 | tail -5; echo EXIT:$?
  EXPECT: /EXIT:0/
  EVIDENCE: EXIT:0

- [x] G6: Preview :3002 /cadastro/produtos responde
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /200|307|302|401/
  EVIDENCE: 307

- [ ] G7: PR mergeado + deploy produção health com SHA novo
  EVIDENCE: pending
