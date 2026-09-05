# Gates: Fix product rows collapsed in catalog UI

Scope: Grupos (ex. CARDIACA) devem iniciar expandidos e mostrar linhas de produto na UI real (preview + produção), sem clicar "Expandir".

- [x] G1: SHA produção confere com tip main (health/stamp)
  CHECK: docker inspect qlmed-app --format '{{.Config.Image}}'
  EXPECT: qlmed-app:
  EVIDENCE: image qlmed-app:17b1014a2eb9051f8e454f8704dcb703735d4443 (pré-fix; tip era #329)

- [x] G2: Causa raiz documentada no código (collapsedGroups / render)
  EVIDENCE: #329 clear pós-fetch insuficiente — render ainda respeitava Set com line:* (Recolher/toggle hostil/race). toggleGroup ao expandir linha adicionava group:* e re-escondia itens. Fix: effectiveCollapsedGroups + useLayoutEffect + safeCollapseKeys + toggle puro.

- [x] G3: Fix aplicado — vista padrão mostra produtos sem clique Expandir
  CHECK: rg -n "effectiveCollapsedGroups|safeCollapseKeys|useLayoutEffect" src/app/(painel)/cadastro/produtos/components/ProductTable.tsx
  EXPECT: effectiveCollapsedGroups
  EVIDENCE: ProductTable usa renderCollapsed=effectiveCollapsedGroups; toggleGroup sem cascade.

- [x] G4: Preview :3002 smoke — HTTP ok + linhas no DOM
  CHECK: curl -sS -o /dev/null -w '%{http_code}' --max-time 5 http://100.83.11.58:3002/
  EXPECT: /200|307|302/
  EVIDENCE: smoke JWT+Playwright productCells=150, cliqueExpandir=0, footer "Pagina 1 de 160 · 7.965 produtos", sample 003884/C8301; após Recolher ainda 150 cells.

- [x] G5: Testes do contrato de grupos passam
  CHECK: ./node_modules/.bin/vitest run src/lib/__tests__/produtos-groups-expanded-contract.test.ts "src/app/(painel)/cadastro/produtos/components/__tests__/product-group-visibility.test.ts" "src/app/(painel)/cadastro/produtos/components/__tests__/ProductTable-expand-guard.test.tsx"
  EXPECT: Test Files  3 passed
  EVIDENCE: 3 files / 9 tests passed (medido 12:24)

- [ ] G6: PR mergeado + deploy produção + health com SHA novo
  EVIDENCE: pending

- [x] G7: Evidência visual — screenshot/DOM com COD. SPICA + descrição visíveis
  EVIDENCE: DOM sampleCodes=["003884","C8301",...] rowTexts com ALEXIS RETRATOR; screenshots em .playwright-mcp/; cliqueExpandir=0
