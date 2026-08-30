# Gates: data do ofício = linha Campo Grande

Scope: A data da autorização é a do fechamento
("Campo Grande, 22 de janeiro de 2026"), não a da OBS de urgência.

- [x] G1: Parser da Mara e da OBS de urgência
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-data-fechamento && npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: Start at  13:16:09 | Duration  129ms (transform 30ms, setup 0ms, import 41ms, tests 7ms, environment 0ms)

- [x] G2: Ingest corrige issuedAt já gravado errado
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-data-fechamento && npx vitest run src/lib/__tests__/impcg-folder-backfill.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: Start at  13:16:09 | Duration  241ms (transform 96ms, setup 0ms, import 61ms, tests 102ms, environment 0ms)

- [x] G3: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-data-fechamento && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: tsc_ok
