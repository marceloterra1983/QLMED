# Gates: fix upload → WhatsApp + e-mail + arquivo isolado + Vencidas

Scope: Após upload manual de certidão, notificar renovação no WhatsApp e e-mail (Marcelo/Daniele/Flávio/José Roberto) e arquivar a antiga; falha de Vencidas numa família não bloqueia as outras; criar pasta Vencidas se faltar.

- [x] G1: Upload com substituto mais novo dispara notifyRenewals
  CHECK: cd /home/marce/qlmed/.worktrees/fix-documentos-upload-renewal-archive && npm test -- --run src/lib/__tests__/documentos-upload-renewal.test.ts 2>&1 | tail -40
  EXPECT: /passed/
  EVIDENCE: Tests 2 passed (2)

- [x] G1b: Renovação envia e-mail aos 4 (Marcelo/Daniele/Flávio/José Roberto)
  CHECK: cd /home/marce/qlmed/.worktrees/fix-documentos-upload-renewal-archive && npm test -- --run src/lib/__tests__/documentos-renewal.test.ts 2>&1 | tail -40
  EXPECT: /passed/
  EVIDENCE: Tests 4 passed (4)

- [x] G2: Arquivo por família: falha numa pasta Vencidas não impede arquivar outra família
  CHECK: cd /home/marce/qlmed/.worktrees/fix-documentos-upload-renewal-archive && npm test -- --run src/lib/__tests__/documentos-arquivar.test.ts 2>&1 | tail -50
  EXPECT: /passed/
  EVIDENCE: Tests 7 passed (7)

- [x] G3: Spec 042 e docs:validate
  CHECK: cd /home/marce/qlmed/.worktrees/fix-documentos-upload-renewal-archive && npm run docs:validate 2>&1 | tail -25
  EXPECT: /OK|passed|valid|0 error|sucesso/i
  EVIDENCE: Documentation validation passed (265 Markdown files, 88 IDs).

- [x] G4: tsc limpo
  CHECK: cd /home/marce/qlmed/.worktrees/fix-documentos-upload-renewal-archive && npx tsc --noEmit 2>&1 | tail -20
  EXPECT: /^$/
  EVIDENCE: tsc --noEmit exit 0, no output
