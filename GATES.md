# Gates: SPEC-033 — Revisão da página de autorizações CASSEMS

Scope: replicar em CASSEMS a revisão da SPEC-032 — tabela só com o chip,
explicação do parse no popup sem duplicar o subtítulo, anexo em streaming sem
esperar o JSON de detalhe, e data futura tratada como leitura errada.
Worktree `.worktrees/cassems-page-review`; todos os CHECK rodam da raiz dela.

- [x] G1: A lista (tabela e cards) não imprime mais o texto do que faltou, só o chip.
  CHECK: rg -c 'reason=\{item\.parseMissingReason\}' 'src/app/(painel)/gestao/cassems/page-client.tsx' || echo NO_REASON_IN_LIST
  EXPECT: NO_REASON_IN_LIST
  EVIDENCE: NO_REASON_IN_LIST

- [x] G2: O popup exibe o texto completo do que faltou, uma vez só, e o subtítulo não repete.
  CHECK: rg -c "parseMissingReason \?\? 'Não foi possível ler o documento'" 'src/app/(painel)/gestao/cassems/page-client.tsx'; rg -c 'subtitle=\{detail\?\.parseMissingReason' 'src/app/(painel)/gestao/cassems/page-client.tsx' || echo NO_DUPLICATE_SUBTITLE
  EXPECT: NO_DUPLICATE_SUBTITLE
  EVIDENCE: 1 | NO_DUPLICATE_SUBTITLE

- [x] G3: O iframe do PDF é montado a partir do id selecionado, sem esperar o detalhe.
  CHECK: rg -c 'cassems/\$\{selectedId\}/arquivo' 'src/app/(painel)/gestao/cassems/page-client.tsx'
  EXPECT: 1
  EVIDENCE: 1

- [x] G4: A rota do anexo não bufferiza o arquivo inteiro antes de responder.
  CHECK: rg -c 'arrayBuffer|downloadOneDriveItemContent' 'src/app/api/gestao/cassems/[id]/arquivo/route.ts' || echo NO_BUFFERING
  EXPECT: NO_BUFFERING
  EVIDENCE: NO_BUFFERING

- [x] G5: A rota devolve stream com Content-Type de PDF, responde antes do fim do upstream e loga durationMs.
  CHECK: npx vitest run src/lib/__tests__/cassems-arquivo-stream.test.ts 2>&1 | rg 'Tests '
  EXPECT: 3 passed
  EVIDENCE: Tests  3 passed (3)

- [x] G6: Parser descarta data futura/fora de faixa e o gap acusa data inválida.
  CHECK: npx vitest run src/lib/__tests__/cassems-parse-oficio.test.ts 2>&1 | rg 'Tests '
  EXPECT: passed
  EVIDENCE: Tests  9 passed (9)

- [x] G7: Nenhuma migration Prisma nem mudança de schema entrou nesta branch.
  CHECK: git diff --name-only origin/main...HEAD | rg 'prisma/|verify-production-migration-window' || echo NO_PRISMA_CHANGE
  EXPECT: NO_PRISMA_CHANGE
  EVIDENCE: NO_PRISMA_CHANGE

- [x] G8: Suíte completa verde.
  CHECK: npm test 2>&1 | tail -4
  EXPECT: passed
  EVIDENCE: Start at  19:41:22 | Duration  3.13s (transform 3.21s, setup 0ms, import 6.77s, tests 5.18s, environment 8ms)

- [x] G9: Tipos limpos.
  CHECK: npx tsc --noEmit > /tmp/cassems-tsc.log 2>&1; echo "TSC_EXIT=$?"
  EXPECT: TSC_EXIT=0
  EVIDENCE: TSC_EXIT=0

- [x] G10: Lint limpo.
  CHECK: npm run lint > /tmp/cassems-lint.log 2>&1; echo "LINT_EXIT=$?"
  EXPECT: LINT_EXIT=0
  EVIDENCE: LINT_EXIT=0

- [x] G11: Documentação e IDs de spec validados.
  CHECK: npm run docs:validate 2>&1 | tail -3
  EXPECT: Documentation validation passed
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (142 Markdown files, 41 IDs).
