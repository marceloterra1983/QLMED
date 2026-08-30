# Gates: data do ofício no popup IMPCG

Scope: O popup de Gestão → IMPCG mostra a data do ofício no
cabeçalho (não só na tabela). Data UTC meia-noite não vira o dia
anterior no fuso de Brasília.

- [ ] G1: Popup IMPCG tem o campo Data no cabeçalho
  CHECK: rg -n "tracking-wider text-slate-400\">Data</dt>" /home/marce/qlmed/app/.worktrees/fix-impcg-popup-data/src/app/\(painel\)/gestao/impcg/page-client.tsx
  EXPECT: Data</dt>
  EVIDENCE: pending

- [ ] G2: formatDocumentDate formata 2023-08-10T00:00:00.000Z como 10/08/2023
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-popup-data && npx vitest run src/lib/__tests__/format-document-date.test.ts --reporter=dot
  EXPECT: Tests  3 passed
  EVIDENCE: pending

- [ ] G3: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-impcg-popup-data && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: pending
