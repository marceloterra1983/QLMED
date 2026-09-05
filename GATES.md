# Gates: Spica Tipo → Linha, SubTipo → Grupo (Subgrupo = null)

Scope: reverter o mapeamento do #338 (Tipo → Linha+Grupo, Sub → Subgrupo) para a
convenção final Tipo = Linha (`productType`), SubTipo = Grupo (`productSubtype`),
`productSubgroup = null` (a origem não tem terceiro nível). Código + testes + spec +
backfill `product_registry` + preview + PR/merge/deploy.

- [x] G1: ODS analisadas direto (content.xml): só Tipo e SubTipo, nenhuma coluna de 3º nível
  CHECK: python3 /tmp/spica-ods-analyze.py /home/marce/qlmed/app/tmp/spica-import/Rel_Produtos_2026_180228.ods 2>&1 | grep -E "outras colunas taxonômicas|Produtos com Tipo vazio|linhas de dados"
  EXPECT: /outras colunas taxonômicas: \[\]/
  EVIDENCE: coluna Tipo idx=3; coluna SubTipo idx=4; outras colunas taxonômicas: [] | Produtos com Tipo vazio: 0 ex: []

- [x] G2: parse.ts mapeia Tipo → productType, Sub → productSubtype, productSubgroup null
  CHECK: cd /home/marce/qlmed/.worktrees/043-spica-tipo-grupo && ./node_modules/.bin/vitest run src/lib/__tests__/spica-parse.test.ts src/lib/__tests__/spica-import-service.test.ts src/lib/__tests__/spica-file-parse.test.ts --reporter=dot 2>&1 | tail -6
  EXPECT: /Test Files\s+3 passed/
  EVIDENCE: Start at  18:30:41 | Duration  190ms (transform 130ms, setup 41ms, import 179ms, tests 10ms, environment 0ms)

- [x] G3: import-spica-direct.mjs sem `productSubtype: ... tipo.productType` duplicado
  CHECK: cd /home/marce/qlmed/.worktrees/043-spica-tipo-grupo && bash -c 'grep -c "productSubtype: tipo.invalid ? null : tipo.productType" scripts/import-spica-direct.mjs; grep -c "productSubgroup: null" scripts/import-spica-direct.mjs'
  EXPECT: /^0\n2$/m
  EVIDENCE: 0 | 2

- [x] G4: Spec Kit atualizado (research + data-model) com a convenção final
  CHECK: cd /home/marce/qlmed/.worktrees/043-spica-tipo-grupo && bash -c 'grep -c "Tipo Spica = Linha" specs/043-spica-product-import/research.md; grep -c "productSubgroup" specs/043-spica-product-import/data-model.md'
  EXPECT: /^[1-9]\n[1-9]$/m
  EVIDENCE: 1 | 1

- [x] G5: Backfill qlmed-db: total 7965, Linha==Grupo só nas 40 OUTROS/OUTROS da origem, product_subgroup null em todas
  CHECK: docker exec qlmed-db psql -U postgres -d postgres -Atc "SELECT count(*) || '|' || coalesce(sum((product_type = product_subtype)::int),0) || '|' || count(product_subgroup) || '|' || count(product_subtype) FROM product_registry;"
  EXPECT: /^7965\|40\|0\|7934$/m
  EVIDENCE: 7965|40|0|7934

- [x] G6: Exemplos 003884 → CARDIACA/ALEXIS/null e 005999 → ORTOPEDIA/CAIXAS DE ORTOPEDIA/null
  CHECK: docker exec qlmed-db psql -U postgres -d postgres -Atc "SELECT codigo||'|'||product_type||'|'||product_subtype||'|'||coalesce(product_subgroup,'NULL') FROM product_registry WHERE codigo IN ('003884','005999') ORDER BY codigo;"
  EXPECT: /003884\|CARDIACA\|ALEXIS\|NULL\n005999\|ORTOPEDIA\|CAIXAS DE ORTOPEDIA\|NULL/
  EVIDENCE: 003884|CARDIACA|ALEXIS|NULL | 005999|ORTOPEDIA|CAIXAS DE ORTOPEDIA|NULL

- [x] G7: typecheck + lint limpos
  CHECK: cd /home/marce/qlmed/.worktrees/043-spica-tipo-grupo && npm run -s typecheck >/tmp/g7-tsc.log 2>&1; echo TSC:$?; npm run -s lint >/tmp/g7-lint.log 2>&1; echo LINT:$?
  EXPECT: /TSC:0\nLINT:0/
  EVIDENCE: TSC:0 | LINT:0

- [x] G8: docs:validate verde
  CHECK: cd /home/marce/qlmed/.worktrees/043-spica-tipo-grupo && npm run -s docs:validate >/tmp/g8-docs.log 2>&1; echo DOCS:$?
  EXPECT: /DOCS:0/
  EVIDENCE: DOCS:0

- [x] G9: Preview :3002 serve a mudança; UI CARDIACA mostra ALEXIS como Grupo (âmbar) sem Subgrupo (manual: browser)
  CHECK: curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /^(200|307)$/m
  EVIDENCE: curl 307 (login) em :3002 no commit 19973f0; Playwright a11y snapshot: row "expand_more CARDIACA 826" → row "expand_more ALEXIS 3" → rows 003884 / 005887 "ALEXIS RETRATOR…"; row "ANEL CARBOMEDICS 15"; zero rows "Selecionar subgrupo"/sub-*. Screenshot /tmp/preview-cardiaca-alexis.png

- [ ] G10: PR mergeado em main, CI verde, deploy produção com health no SHA
  CHECK: bash -c 'gh run list --workflow=deploy-production.yml --branch main --limit 1 --json conclusion,headSha --jq ".[0] | .conclusion + \" \" + .headSha"; curl -s http://127.0.0.1:13000/api/health'
  EXPECT: /success [0-9a-f]{40}[\s\S]*"status":"ok"/
  EVIDENCE: pending
