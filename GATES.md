# Gates: card compacto IMPCG/CASSEMS

Scope: No mobile/compacto o card mostra paciente, local e médico.
Não mostra valor. Desktop mantém a coluna Total.

- [x] G1: Cards compactos não usam formatBrl; usam hospital e médico
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-mobile-card-campos && npx vitest run src/lib/__tests__/gestao-mobile-card.test.ts --reporter=dot
  EXPECT: Tests  2 passed
  EVIDENCE: Start at  12:49:51 | Duration  113ms (transform 15ms, setup 0ms, import 23ms, tests 2ms, environment 0ms)

- [x] G2: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-mobile-card-campos && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: tsc_ok
