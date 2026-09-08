# Gates: 070 filtros de listagem

Scope: Produtos alinha ao padrão Controle (barra inline + FILTER_INPUT_CLS + busca na hierarquia + filtro instantâneo na árvore); demais listagens usam o token canônico; spec 070 documenta o padrão A/B.

- [x] G1: Spec 070 com IDs de requisito
  CHECK: test -f specs/070-filtros-listagem/spec.md && rg -n "FR-070" specs/070-filtros-listagem/spec.md
  EXPECT: FR-070
  EVIDENCE: 54:- **FR-070-04**: Na visão em árvore, digitar na busca MUST filtrar o catálogo já carregado sem novo `search=` na API. | 55:- **FR-070-05**: Contas a pagar/receber, Rotinas e Vínculos NF MUST usar `

- [x] G2: API de produtos busca também linha/grupo/subgrupo
  CHECK: npm test -- --run src/lib/__tests__/products-list-visibility.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  17:12:17 | Duration  252ms (transform 72ms, setup 17ms, import 140ms, tests 9ms, environment 0ms)

- [x] G3: filterProductRows casa hierarquia (caso ALEXIS)
  CHECK: npm test -- --run src/app/\(painel\)/cadastro/produtos/components/__tests__/product-filters.test.ts
  EXPECT: Test Files  1 passed
  EVIDENCE: Start at  17:12:18 | Duration  144ms (transform 34ms, setup 20ms, import 28ms, tests 3ms, environment 0ms)

- [x] G4: ProductFilters usa FILTER_INPUT_CLS e não MobileFilterWrapper
  CHECK: rg -n "FILTER_INPUT_CLS" src/app/\(painel\)/cadastro/produtos/components/ProductFilters.tsx && ! rg -q "MobileFilterWrapper" src/app/\(painel\)/cadastro/produtos/components/ProductFilters.tsx && echo FILTERS_INLINE_OK
  EXPECT: FILTERS_INLINE_OK
  EVIDENCE: 111:              className={`${FILTER_INPUT_CLS} w-auto px-2`} | FILTERS_INLINE_OK

- [x] G5: Token FILTER_INPUT_CLS nas listagens que ainda copiavam py-2
  CHECK: rg -l "FILTER_INPUT_CLS" src/app/\(painel\)/financeiro/components/FinanceiroPageClient.tsx src/app/\(painel\)/sistema/rotinas/page-client.tsx src/app/\(painel\)/cadastro/produtos/vinculos-nfe/page-client.tsx | wc -l
  EXPECT: 3
  EVIDENCE: 3

- [x] G6: docs:validate aceita SPEC-070
  CHECK: npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (258 Markdown files, 84 IDs).

- [x] G7: tsc --noEmit sem erro
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G8: Preview Produtos — busca alexis inclui item só pelo grupo
  EVIDENCE: preview :3002 cwd=070-filtros-listagem; busca "alexis" → 3 no cadastro + CARDIACA 3; expandir mostra ESTABILIZADOR DE TECIDO DESCARTÁVEL (casa pelo grupo ALEXIS) além dos dois retratores.
