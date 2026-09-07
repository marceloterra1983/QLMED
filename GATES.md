# Gates: SPEC-057 Saída Material

Scope: Página e APIs de Saída Material (4 abas), nav Estoque ordenada, checklist Prisma, CFOP defaults, preview HTTP.

- [x] G1: Spec SPEC-057 existe com REQ/AC
  CHECK: test -f specs/057-saida-material/spec.md && rg -q "SPEC-057|REQ-001|AC-001" specs/057-saida-material/spec.md && echo SPEC_OK
  EXPECT: SPEC_OK
  EVIDENCE: SPEC_OK

- [x] G2: Design note existe
  CHECK: test -f docs/superpowers/specs/2026-09-07-saida-material-design.md && echo DESIGN_OK
  EXPECT: DESIGN_OK
  EVIDENCE: DESIGN_OK

- [x] G3: Ordem nav Estoque Entrada → Controle → Saída Material
  CHECK: npx vitest run src/lib/__tests__/navigation.test.ts -t "Estoque: Entrada" --reporter=dot 2>&1 | tail -5
  EXPECT: passed
  EVIDENCE:       Tests  1 passed | 15 skipped (16) |    Start at  12:41:42 |    Duration  181ms (transform 42ms, setup 21ms, import 37ms, tests 3ms, environment 0ms)

- [x] G4: Página /estoque/saida-material existe
  CHECK: test -f 'src/app/(painel)/estoque/saida-material/page-client.tsx' && rg -q "Saída Material" 'src/app/(painel)/estoque/saida-material/page-client.tsx' && echo PAGE_OK
  EXPECT: PAGE_OK
  EVIDENCE: PAGE_OK

- [x] G5: Migration StockExitChecklist pinada
  CHECK: test -f prisma/migrations/20260907140000_stock_exit_checklist/migration.sql && rg -q "20260907140000_stock_exit_checklist" scripts/verify-production-migration-window.cjs && node scripts/test-production-migration-window.cjs && echo MIG_OK
  EXPECT: MIG_OK
  EVIDENCE: Production migration window static contract passed. | MIG_OK

- [x] G6: Testes unitários saida-material + navigation
  CHECK: npx vitest run src/lib/__tests__/saida-material.test.ts src/lib/__tests__/navigation.test.ts --reporter=dot 2>&1 | tail -5
  EXPECT: passed
  EVIDENCE: Test Files 2 passed (2); Tests 21 passed (21)

- [x] G7: tsc limpo
  CHECK: npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G8: ui:dialogs + docs:validate
  CHECK: npm run ui:dialogs && npm run docs:validate && echo UI_DOCS_OK
  EXPECT: UI_DOCS_OK
  EVIDENCE: Documentation validation passed (243 Markdown files, 72 IDs). | UI_DOCS_OK

- [x] G9: Preview HTTP /estoque/saida-material
  CHECK: code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3002/estoque/saida-material); echo "HTTP_$code"; echo "$code" | grep -Eq '^(200|302|307)$' && echo PREVIEW_OK
  EXPECT: PREVIEW_OK
  EVIDENCE: HTTP_307 | PREVIEW_OK
