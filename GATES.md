# Gates: SPEC-032 — Revisão da página de autorizações IMPCG

Scope: tabela só com o chip de status, explicação do parse no popup, anexo em
streaming sem esperar o JSON de detalhe, e data futura tratada como leitura
errada. Worktree `.worktrees/impcg-page-review`; todos os CHECK rodam da raiz.

- [x] G1: A lista (tabela e cards) não imprime mais o texto do que faltou, só o chip.
  CHECK: rg -c 'reason=\{item\.parseMissingReason\}' 'src/app/(painel)/gestao/impcg/page-client.tsx' || echo NO_REASON_IN_LIST
  EXPECT: NO_REASON_IN_LIST
  EVIDENCE: NO_REASON_IN_LIST

- [x] G2: O popup de detalhe exibe o texto completo do que faltou, uma vez só.
  CHECK: rg -c 'parseMissingReason \?\? .Não foi possível ler o documento.' 'src/app/(painel)/gestao/impcg/page-client.tsx'
  EXPECT: 1
  EVIDENCE: 1

- [x] G3: O iframe do PDF é montado a partir do id selecionado, sem esperar o detalhe.
  CHECK: rg -c 'impcg/\$\{selectedId\}/arquivo' 'src/app/(painel)/gestao/impcg/page-client.tsx'
  EXPECT: 1
  EVIDENCE: 1

- [x] G4: A rota do anexo não bufferiza o arquivo inteiro antes de responder.
  CHECK: rg -c 'arrayBuffer|downloadOneDriveItemContent' 'src/app/api/gestao/impcg/[id]/arquivo/route.ts' || echo NO_BUFFERING
  EXPECT: NO_BUFFERING
  EVIDENCE: NO_BUFFERING

- [x] G5: A rota devolve stream com Content-Type de PDF e loga durationMs.
  CHECK: npx vitest run src/lib/__tests__/impcg-arquivo-stream.test.ts 2>&1 | tail -8
  EXPECT: Tests  3 passed
  EVIDENCE: Tests  3 passed (3) — impcg-arquivo-stream.test.ts

- [x] G6: Parser descarta data futura e o gap acusa data inválida.
  CHECK: npx vitest run src/lib/__tests__/impcg-parse-oficio.test.ts 2>&1 | tail -8
  EXPECT: Tests  15 passed
  EVIDENCE: Tests  15 passed (15) — impcg-parse-oficio.test.ts

- [x] G7: Suíte completa verde.
  CHECK: npm test 2>&1 | tail -4
  EXPECT: 583 passed
  EVIDENCE: Test Files  83 passed | 3 skipped (86); Tests  583 passed | 4 skipped (587)

- [x] G8: Tipos limpos.
  CHECK: npx tsc --noEmit > /tmp/impcg-tsc.log 2>&1; echo "TSC_EXIT=$?"
  EXPECT: TSC_EXIT=0
  EVIDENCE: TSC_EXIT=0

- [x] G9: Lint limpo.
  CHECK: npm run lint > /tmp/impcg-lint.log 2>&1; echo "LINT_EXIT=$?"
  EXPECT: LINT_EXIT=0
  EVIDENCE: LINT_EXIT=0

- [x] G10: Documentação e IDs de spec validados.
  CHECK: npm run docs:validate 2>&1 | tail -3
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (140 Markdown files, 39 IDs).
