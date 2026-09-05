# Gates: fix produtos grupos expandidos v2

Scope: Grupos em /cadastro/produtos abertos por padrão com linhas visíveis; total explicado; preview smoke + PR/merge/deploy.

- [x] G1: loadProducts limpa collapsedGroups após fetch bem-sucedido
  CHECK: rg -n "setCollapsedGroups\(new Set\(\)\)" src/app/\(painel\)/cadastro/produtos/page-client.tsx
  EXPECT: /setCollapsedGroups\(new Set\(\)\)/
  EVIDENCE: lines 211, 224, 278

- [x] G2: Banner "Grupos recolhidos" só aparece quando collapsedGroups.size > 0 + CTA se nenhum item visível
  CHECK: rg -n "hasCollapsedGroups|anyProductRowVisible|Expandir e mostrar" src/app/\(painel\)/cadastro/produtos/components/ProductTable.tsx
  EXPECT: /anyProductRowVisible/
  EVIDENCE: anyProductRowVisible + CTA "Expandir e mostrar produtos"

- [x] G3: Teste contract + list-collapse passam
  CHECK: npm test -- --run src/lib/__tests__/produtos-groups-expanded-contract.test.ts src/lib/__tests__/list-collapse.test.ts 2>&1 | tail -20
  EXPECT: /Test Files  2 passed/
  EVIDENCE: Test Files 2 passed (2); Tests 10 passed (10)

- [x] G4: Contagem 4957 vs Spica documentada (active filter)
  EVIDENCE: product_registry total=7965 active=4957 out_of_line=3008 with_codigo=7965; default lineStatus agora 'all'

- [x] G5: Smoke preview :3002 HTTP ok na rota
  CHECK: curl -sS -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /200|307|302/
  EVIDENCE: 307 (redirect login); unit WorkingDirectory=fix-produtos-grupos-v2; /login 200

- [ ] G6: PR mergeado e produção no SHA novo
  EVIDENCE: pending
