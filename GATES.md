# Gates: data fiel + edição sutil no popup

Scope: OCR não inventa data (só Campo Grande ou DATA:).
Popup tem lápis sutil; campo corrigido fica marcado “editado”.
Viewer não edita. Coleta não sobrescreve campo editado.

- [x] G1: Parser não usa a primeira data solta do texto
  CHECK: cd /home/marce/qlmed/app/.worktrees/feat-gestao-editar-campos-lidos && npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: Start at  14:16:43 | Duration  132ms (transform 32ms, setup 0ms, import 45ms, tests 8ms, environment 0ms)

- [x] G2: editedFields e PATCH de overwrite
  CHECK: cd /home/marce/qlmed/app/.worktrees/feat-gestao-editar-campos-lidos && npx vitest run src/lib/__tests__/gestao-oficio-edits.test.ts src/lib/__tests__/impcg-acl.test.ts --reporter=dot
  EXPECT: Tests
  EVIDENCE: Start at  14:16:44 | Duration  243ms (transform 108ms, setup 0ms, import 182ms, tests 21ms, environment 0ms)

- [x] G3: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/feat-gestao-editar-campos-lidos && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: tsc_ok
