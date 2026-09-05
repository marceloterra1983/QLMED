# Gates: Spica Tipo=Grupo / Sub=Subgrupo

Scope: Mapear Tipo→Grupo (productSubtype) e Sub→Subgrupo (productSubgroup), backfill 7965, UI/preview, PR+deploy.

- [x] G1: Banco — product_subtype e product_subgroup preenchidos (~7934+)
  CHECK: docker exec qlmed-db psql -U postgres -d postgres -tAc "SELECT COUNT(*) FILTER (WHERE COALESCE(btrim(product_subtype),'')<>'') || ' subtype ' || COUNT(*) FILTER (WHERE COALESCE(btrim(product_subgroup),'')<>'') || ' subgroup / ' || COUNT(*) FROM product_registry"
  EXPECT: /793[0-9] subtype 793[0-9] subgroup/
  EVIDENCE: 7934 subtype 7934 subgroup / 7965

- [x] G2: Testes Spica verdes
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx vitest run src/lib/__tests__/spica-parse.test.ts src/lib/__tests__/spica-file-parse.test.ts --reporter=dot 2>&1 | tail -8
  EXPECT: /Test Files\s+\d+ passed/
  EVIDENCE: Start at  13:20:48 | Duration  164ms (transform 85ms, setup 31ms, import 99ms, tests 8ms, environment 0ms)

- [x] G3: Typecheck limpo
  CHECK: cd /home/marce/qlmed/.worktrees/042-spica-import && npx tsc --noEmit 2>&1 | tail -5; echo EXIT:$?
  EXPECT: /EXIT:0/
  EVIDENCE: EXIT:0

- [x] G4: Preview :3002 responde
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/cadastro/produtos
  EXPECT: /200|307|302|401/
  EVIDENCE: 307

- [ ] G5: PR mergeado + deploy produção health
  EVIDENCE: pending
