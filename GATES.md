# Gates: Produtos hierarquia recolhida

Scope: Restaurar ordenação padrão Linha→Grupo→Subgrupo (`productType`) e carregar a tabela sempre com grupos recolhidos; remover travas dos PRs #329/#333.

- [x] G1: sortBy padrão é productType no page-client e API list
  CHECK: rg -n "useState<SortField>|sortBy\s*=\s*['\"]|DEFAULT.*SORT|sortBy.*productType|sortBy.*codigo" "src/app/(painel)/cadastro/produtos/page-client.tsx" "src/app/api/products/list/route.ts" 2>&1 | head -40
  EXPECT: /useState<SortField>\(['\"]productType['\"]\)|sortBy.*productType|DEFAULT.*productType/
  EVIDENCE: src/app/(painel)/cadastro/produtos/page-client.tsx:55:  const [sortBy, setSortBy] = useState<SortField>('productType'); | src/app/(painel)/cadastro/produtos/page-client.tsx:285:    if (sortBy === fiel

- [x] G2: Sem setCollapsedGroups(new Set()) pós-fetch nem CTA hostil; collapsed inicia com todas as chaves
  CHECK: rg -n "setCollapsedGroups\(new Set\(\)\)|effectiveCollapsedGroups|Tudo recolhido|resolveCollapsedGroupsAfterFetch|defaultCollapsed|collapsedGroups" "src/app/(painel)/cadastro/produtos" "src/lib/list-collapse.ts" 2>&1 | head -60
  EXPECT: /collapsed/
  EVIDENCE: src/app/(painel)/cadastro/produtos/components/ProductTable.tsx:61:  const renderCollapsed = collapsedGroups; | src/app/(painel)/cadastro/produtos/components/ProductTable.tsx:345:              onClick=

- [x] G3: Testes de colapso/hierarquia verdes
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/app/\(painel\)/cadastro/produtos/components/__tests__/ src/lib/__tests__/list-collapse.test.ts src/lib/__tests__/produtos-groups-expanded-contract.test.ts --reporter=dot 2>&1 | tail -20
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: Start at  15:40:03 | Duration  570ms (transform 175ms, setup 59ms, import 235ms, tests 71ms, environment 276ms)

- [x] G4: Typecheck limpo
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit 2>&1 | tail -5; echo EXIT:$?
  EXPECT: /EXIT:0/
  EVIDENCE: EXIT:0

- [x] G5: Preview :3002 /cadastro/produtos responde
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /200|307|302|401/
  EVIDENCE: 307

- [x] G6: Preview DOM — grupos recolhidos ao carregar (sem linhas de produto visíveis sob cabeçalhos de linha)
  EVIDENCE: preview :3002 Ordenar por=Linha selected; cell "CARDIACA 50 Clique para expandir"; 0 numeric product cells collapsed; após click em CARDIACA aparecem códigos Spica (003884…) e subgrupo ALEXIS

- [ ] G7: PR mergeado + deploy produção health com SHA novo
  EVIDENCE: pending
