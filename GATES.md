# Gates: Caption curta NF-e WhatsApp

Scope: Mensagem WhatsApp de NF-e recebida sem chave, sem rótulos Emitente/Valor, com shortName do cadastro quando existir.

- [x] G1: Caption NF-e sem chave nem rótulo Emitente/Valor
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-whatsapp-caption && npx vitest run src/lib/__tests__/cte-whatsapp-caption.test.ts 2>&1 | tail -30
  EXPECT: /Tests?\s+\d+\s+passed/
  EVIDENCE: Start at  19:48:25 | Duration  308ms (transform 73ms, setup 0ms, import 91ms, tests 93ms, environment 0ms)

- [x] G2: Worker WhatsApp NF-e usa caption e omite chave
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-whatsapp-caption && python3 -m unittest -v scripts/test_notification_outbox_worker.py 2>&1 | tail -25
  EXPECT: OK
  EVIDENCE: Ran 5 tests in 0.001s | OK

- [x] G3: shortName do cadastro tem prioridade sobre razão social
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-whatsapp-caption && npx vitest run src/lib/__tests__/cte-whatsapp-caption.test.ts -t "shortName" 2>&1 | tail -20
  EXPECT: /passed/
  EVIDENCE: Start at  19:48:26 | Duration  683ms (transform 99ms, setup 0ms, import 119ms, tests 3ms, environment 0ms)

- [x] G4: E-mail de NF-e permanece com texto completo (chave)
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-whatsapp-caption && python3 -m unittest -v scripts/test_notification_outbox_worker.py 2>&1 | grep -E "nfe_email|OK|FAIL"
  EXPECT: /nfe_email.*ok|OK/
  EVIDENCE: test_nfe_email_keeps_full_text_with_key (scripts.test_notification_outbox_worker.WorkerCaptionTests.test_nfe_email_keeps_full_text_with_key) ... ok | OK

- [x] G5: docs:validate passa com SPEC-033
  CHECK: cd /home/marce/qlmed/.worktrees/nfe-whatsapp-caption && npm run docs:validate 2>&1 | tail -15
  EXPECT: /Markdown files|IDs/
  EVIDENCE: > node ./scripts/validate-docs.mjs | Documentation validation passed (145 Markdown files, 41 IDs).
