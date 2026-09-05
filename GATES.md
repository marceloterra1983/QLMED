# Gates: 044 rotinas detail popup

Scope: Popup Detalhes/Histórico em rotinas; API history; tabela sem Categoria/Lock; FR-009/AC-009.

- [x] G1: Vitest rotinas + system-routines
  CHECK: npx vitest run src/lib/__tests__/system-routines.test.ts src/app/api/sistema/rotinas --reporter=dot
  EXPECT: /Test Files\s+3 passed/
  EVIDENCE: Test Files 3 passed (3); Tests 24 passed (24)

- [x] G2: Typecheck limpo
  CHECK: npx tsc --noEmit
  EXPECT: exit 0
  EVIDENCE: exit 0 (2026-09-05)

- [x] G3: docs:validate
  CHECK: npm run docs:validate
  EXPECT: /Documentation validation passed/
  EVIDENCE: Documentation validation passed (205 Markdown files, 55 IDs)

- [ ] G4: PR mergeado + produção no SHA
  EVIDENCE: pending
