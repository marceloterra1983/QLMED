# Gates: IMPCG data OCR + edição de campos faltantes

Scope: Ler a data do ofício mesmo com OCR ruidoso; se o campo
continuar vazio, editor preenche na tela. Motivo do parcial já na frente.

- [ ] G1: Parser lê data com OCR ruidoso (O/0, hífen, por extenso)
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-parse-parcial-motivo && npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts --reporter=dot
  EXPECT: Tests  10 passed
  EVIDENCE: pending

- [ ] G2: Fixture 17673 continua ok; parcial ainda descreve o que faltou
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-parse-parcial-motivo && npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts src/lib/__tests__/impcg-list-contract.test.ts --reporter=dot
  EXPECT: Tests  14 passed
  EVIDENCE: pending

- [ ] G3: Viewer PATCH 403; editor preenche data e o status pode virar ok
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-parse-parcial-motivo && npx vitest run src/lib/__tests__/impcg-acl.test.ts --reporter=dot
  EXPECT: Tests  12 passed
  EVIDENCE: pending

- [ ] G4: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-parse-parcial-motivo && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: pending
