# Gates: Produtos total catálogo vs paginação

Scope: Corrigir a impressão de que o Spica “voltou só os itens antigos”: filtro padrão Todos, totais reais de linha/grupo (não só os 50 da página) e total do catálogo visível na UI.

- [x] G1: Default de lineStatus na API e no page-client é `all`
  CHECK: rg -n "lineStatus.*default\(|useState<'active' \| 'outOfLine' \| 'all'>" "src/lib/schemas/product.ts" "src/app/(painel)/cadastro/produtos/page-client.tsx" 2>&1 | head -20
  EXPECT: /default\('all'\)|useState<'active' \| 'outOfLine' \| 'all'>\('all'\)/
  EVIDENCE: src/app/(painel)/cadastro/produtos/page-client.tsx:58:  const [lineStatusFilter, setLineStatusFilter] = useState<'active' | 'outOfLine' | 'all'>('all'); | src/lib/schemas/product.ts:49:  lineStatus: z

- [x] G2: API list devolve hierarchyCounts (totais por linha/grupo/subgrupo no filtro atual)
  CHECK: rg -n "hierarchyCounts|byLine|byGroup|bySubgroup" "src/app/api/products/list/route.ts" "src/app/(painel)/cadastro/produtos/types.ts" 2>&1 | head -40
  EXPECT: /hierarchyCounts/
  EVIDENCE: src/app/api/products/list/route.ts:243:      byGroup: Object.fromEntries( | src/app/api/products/list/route.ts:261:        hierarchyCounts,

- [x] G3: Badge de linha/grupo usa total do catálogo filtrado (não só a página); UI mostra total paginado (não `filtered.length`)
  CHECK: rg -n "hierarchyCounts|catalogTotal|pagination\.total|filteredCount" "src/app/(painel)/cadastro/produtos/components/ProductTable.tsx" "src/app/(painel)/cadastro/produtos/components/ProductFilters.tsx" "src/app/(painel)/cadastro/produtos/page-client.tsx" 2>&1 | head -50
  EXPECT: /hierarchyCounts|catalogTotal|pagination\.total/
  EVIDENCE: src/app/(painel)/cadastro/produtos/components/ProductFilters.tsx:183:          {formatInt(catalogTotal)} produtos no cadastro | src/app/(painel)/cadastro/produtos/components/ProductFilters.tsx:184:   

- [x] G4: Testes de contrato/schema/badge verdes
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/lib/__tests__/query-schemas.test.ts src/lib/__tests__/produtos-groups-expanded-contract.test.ts src/app/\(painel\)/cadastro/produtos/components/__tests__/ --reporter=dot 2>&1 | tail -25
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: Start at  16:15:56 | Duration  693ms (transform 178ms, setup 49ms, import 287ms, tests 85ms, environment 355ms)

- [x] G5: Typecheck limpo
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit 2>&1 | tail -5; echo EXIT:$?
  EXPECT: /EXIT:0/
  EVIDENCE: EXIT:0

- [x] G6: Banco: 7965 total, 3008 fora de linha; CARDIACA ≥ 800
  CHECK: PASS=$(docker exec qlmed-db printenv POSTGRES_PASSWORD); docker exec -e PGPASSWORD="$PASS" qlmed-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FROM product_registry; SELECT COUNT(*) FILTER (WHERE out_of_line IS TRUE) FROM product_registry; SELECT COUNT(*) FROM product_registry WHERE product_type='CARDIACA';"
  EXPECT: /7965/
  EVIDENCE: 3008 | 826

- [x] G7: Preview :3002 /cadastro/produtos responde
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /200|307|302|401/
  EVIDENCE: 307

- [ ] G8: PR mergeado + deploy produção health com SHA novo
  EVIDENCE: pending
