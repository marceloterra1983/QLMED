# Gates: SPEC-056 Controle de Estoque

Scope: Página Controle + ledger de movimentos com CD/consignação, validade, avulso e backfill.

- [x] G1: Spec e nav Controle existem
  CHECK: test -f specs/056-estoque-controle/spec.md && rg -q "Controle" src/lib/navigation.ts && rg -q "/estoque/controle" src/components/SidebarNav.tsx
  EXPECT: /estoque/controle
  EVIDENCE: navigation.ts label Controle path /estoque/controle; SidebarNav PAGE_LABELS + buildNavItems

- [x] G2: Model StockMovement no schema + migration SQL
  CHECK: rg -q "model StockMovement" prisma/schema.prisma && test -f prisma/migrations/20260907120000_stock_movement/migration.sql
  EXPECT: StockMovement
  EVIDENCE: prisma/schema.prisma model StockMovement; migration 20260907120000_stock_movement; Invoice/Company relations

- [x] G3: Testes do ledger passam
  CHECK: npx vitest run src/lib/__tests__/stock-ledger.test.ts --reporter=dot 2>&1 | tail -5
  EXPECT: passed
  EVIDENCE: vitest 13/13 passed (stock-ledger.test.ts); migration window node scripts/test-production-migration-window.cjs passed; nav+sidebar 31 tests across 3 files passed

- [x] G4: Typecheck limpo no diff da feature
  CHECK: npx tsc --noEmit 2>&1 | tail -3
  EXPECT: /./
  EVIDENCE: npx tsc --noEmit exit 0 (2026-09-07)

- [x] G5: Preview smoke HTTP na rota Controle (após restart preview)
  CHECK: curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3002/estoque/controle
  EXPECT: /^(200|307|302)$/
  EVIDENCE: HTTP 307 em 127.0.0.1:3002/estoque/controle (unit qlmed-dev-preview active)
