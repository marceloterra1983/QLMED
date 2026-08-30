# Gates: PDF do ofício sem painel de miniaturas

Scope: O popup IMPCG/CASSEMS abre o PDF no pdf.js já vendorado,
sem a faixa de thumbnails à esquerda do Chrome. Sem pacote novo.

- [x] G1: URL do viewer fecha o painel (`pagemode=none`)
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-pdf-sem-sidebar && npx vitest run src/lib/__tests__/embedded-pdf-src.test.ts --reporter=dot
  EXPECT: Tests  2 passed
  EVIDENCE: Start at  12:39:35 | Duration  105ms (transform 18ms, setup 0ms, import 25ms, tests 2ms, environment 0ms)

- [x] G2: Iframes IMPCG e CASSEMS usam o helper
  CHECK: rg -n "embeddedPdfViewerSrc" /home/marce/qlmed/app/.worktrees/fix-gestao-pdf-sem-sidebar/src/app/\(painel\)/gestao/impcg/page-client.tsx /home/marce/qlmed/app/.worktrees/fix-gestao-pdf-sem-sidebar/src/app/\(painel\)/gestao/cassems/page-client.tsx
  EXPECT: embeddedPdfViewerSrc
  EVIDENCE: /home/marce/qlmed/app/.worktrees/fix-gestao-pdf-sem-sidebar/src/app/(painel)/gestao/impcg/page-client.tsx:8:import { closeEmbeddedPdfSidebar, embeddedPdfViewerSrc } from '@/lib/embedded-pdf-src'; | /h

- [x] G3: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/fix-gestao-pdf-sem-sidebar && npx tsc --noEmit && echo tsc_ok
  EXPECT: tsc_ok
  EVIDENCE: tsc_ok
