# Gates: hospital abaixo do paciente na lista Gestão

Scope: Tabelas IMPCG e CASSEMS mostram o hospital sob o
paciente, com texto mais claro. Sem coluna Hospital à parte.

- [x] G1: As duas listas usam GestaoPatientHospital e não têm th Hospital
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-tabela-paciente-hospital && npx vitest run src/lib/__tests__/gestao-mobile-card.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: Start at  16:50:03 | Duration  105ms (transform 15ms, setup 0ms, import 22ms, tests 3ms, environment 0ms)

- [x] G2: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-tabela-paciente-hospital && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: tsc_ok
