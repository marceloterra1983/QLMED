# Gates: fix/impcg-mailbox-timeout

Scope: o orçamento `IMPCG_MAILBOX_TIMEOUT_MS` passa a valer por requisição HTTP em
vez de por caixa, para que a ingestão IMPCG por e-mail deixe de abortar o
histórico inteiro da caixa antes de processar qualquer mensagem.

Causa raiz: `runImpcgIngest` criava um único `AbortSignal.timeout(30s)` por caixa e
o reutilizava na paginação completa da listagem e em todos os downloads de anexo.
Com histórico desde 2018 o orçamento expirava sempre
(`The operation was aborted due to timeout`).

- [x] G1: a listagem paginada cria um deadline novo por página, sem signal de vida longa no loop `while (next)`
  CHECK: rg -n 'perRequestSignal' src/lib/graph-mail-client.ts
  EXPECT: function perRequestSignal
  EVIDENCE: 146:      perRequestSignal(options.signal), | 198:    perRequestSignal(signal),

- [x] G2: o ingest não cria mais orçamento por caixa nem repassa o mesmo signal para listagem e anexos
  CHECK: rg -c 'AbortSignal.timeout' src/lib/impcg/ingest.ts || echo NONE
  EXPECT: NONE
  EVIDENCE: NONE

- [x] G3: cancelamento externo continua respeitado e a regressão está coberta por teste
  CHECK: npx vitest run src/lib/__tests__/impcg-mailbox-timeout.test.ts 2>&1 | tail -6
  EXPECT: 3 passed
  EVIDENCE: Start at  15:40:35 | Duration  292ms (transform 111ms, setup 0ms, import 30ms, tests 172ms, environment 0ms)

- [x] G4: existe teste referenciando a listagem paginada corrigida
  CHECK: rg -ln 'listMailboxMessagesBySender' src/lib/__tests__
  EXPECT: impcg-mailbox-timeout.test.ts
  EVIDENCE: src/lib/__tests__/impcg-mailbox-timeout.test.ts

- [x] G5: typecheck limpo
  CHECK: npx tsc --noEmit 2>&1 | rg -c 'error TS' || echo ZERO_TS_ERRORS
  EXPECT: ZERO_TS_ERRORS
  EVIDENCE: ZERO_TS_ERRORS

- [x] G6: lint limpo nos arquivos tocados
  CHECK: npx eslint src/lib/graph-mail-client.ts src/lib/impcg/ingest.ts src/lib/__tests__/impcg-mailbox-timeout.test.ts 2>&1 | rg -c 'error' || echo ZERO_LINT_ERRORS
  EXPECT: ZERO_LINT_ERRORS
  EVIDENCE: ZERO_LINT_ERRORS

- [x] G7: suíte de testes do repo verde (comando canônico do AGENTS.md)
  CHECK: npm test 2>&1 | rg 'Test Files'
  EXPECT: 82 passed
  EVIDENCE: Test Files  82 passed | 3 skipped (85)

- [ ] G8: em produção a ingestão conclui ciclo sem timeout e as autorizações passam do baseline de 9
  EVIDENCE: pending
