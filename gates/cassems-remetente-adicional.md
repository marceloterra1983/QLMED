# Gates: Remetente adicional CASSEMS

Scope: A coleta lê a caixa `joseroberto@qlmed.com.br` e aceita os
remetentes `oficio.cconecte@cassems.com.br` e o endereço OPME
confirmado no Graph; deduplica por `internetMessageId`.

- [x] G1: Caixa monitorada continua `joseroberto@qlmed.com.br`
  CHECK: grep -n "CASSEMS_MAILBOXES" /home/marce/qlmed/app/.worktrees/cassems-sender/src/lib/cassems/constants.ts
  EXPECT: joseroberto@qlmed.com.br
  EVIDENCE: 9:export const CASSEMS_MAILBOXES = ['joseroberto@qlmed.com.br'] as const;

- [x] G2: Filtro inclui o remetente antigo e o OPME confirmado
  CHECK: grep -E "oficio.cconecte@cassems.com.br|mailing.opme@cassems.com.br" /home/marce/qlmed/app/.worktrees/cassems-sender/src/lib/cassems/constants.ts
  EXPECT: /mailing\.opme@cassems\.com\.br/
  EVIDENCE: export const CASSEMS_SENDER_EMAIL = 'oficio.cconecte@cassems.com.br'; | 'mailing.opme@cassems.com.br',

- [x] G3: Listagem aceita o novo remetente, o antigo, e dedup por internetMessageId
  CHECK: cd /home/marce/qlmed/app/.worktrees/cassems-sender && npx vitest run src/lib/__tests__/cassems-sender-filter.test.ts 2>&1 | tail -25
  EXPECT: /Tests?\s+\d+\s+passed/
  EVIDENCE: Start at  21:00:51 | Duration  159ms (transform 39ms, setup 0ms, import 31ms, tests 43ms, environment 0ms)

- [x] G4: Suite de testes do repo
  CHECK: cd /home/marce/qlmed/app/.worktrees/cassems-sender && npm test 2>&1 | tail -20
  EXPECT: /Test Files\s+\d+\s+passed/
  EVIDENCE: Test Files 90 passed | 3 skipped; Tests 673 passed | 4 skipped; Duration 4.26s

- [x] G5: Typecheck
  CHECK: cd /home/marce/qlmed/app/.worktrees/cassems-sender && npx tsc --noEmit && echo TSC_OK
  EXPECT: TSC_OK
  EVIDENCE: TSC_OK

- [x] G6: Lint
  CHECK: cd /home/marce/qlmed/app/.worktrees/cassems-sender && npm run lint 2>&1 | tail -15
  EXPECT: /eslint/
  EVIDENCE: > qlmed@0.1.0 lint | > eslint .

- [x] G7: Spec Kit docs:validate
  CHECK: cd /home/marce/qlmed/app/.worktrees/cassems-sender && npm run docs:validate
  EXPECT: Documentation validation passed
  EVIDENCE: Documentation validation passed (149 Markdown files, 44 IDs).

- [x] G8: Endereço exato do remetente OPME confirmado no Graph (sem token no log)
  EVIDENCE: Graph 200 na caixa joseroberto@qlmed.com.br; from.address exato mailing.opme@cassems.com.br; histórico 3554 com anexo; janela 7d = 2; oficio.cconecte = 0; $filter or também 200/2; único remetente cassems na janela.

- [x] G9: Contagem de 7 dias remediada antes do deploy
  EVIDENCE: Graph 200; mailing.opme@cassems.com.br janela 7d = 2 (desde 2026-08-25T00:00:51Z); histórico 3554; oficio.cconecte = 0; único cassems na janela.

- [x] G10: Ingestão não reintroduz timeout compartilhado por caixa
  CHECK: grep -c "AbortSignal.timeout" /home/marce/qlmed/app/.worktrees/cassems-sender/src/lib/cassems/ingest.ts || true
  EXPECT: 0
  EVIDENCE: 0

- [ ] G11: Produção saudável no SHA do merge
  EVIDENCE: pending
