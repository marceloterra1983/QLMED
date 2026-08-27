# Evidence: SPEC-015 — destino WhatsApp em grupo único

Branch `feat/whatsapp-group-destination`. Medido em 2026-08-27.

- [x] G1: um WhatsApp `@g.us`, nenhum telefone pessoal
  EVIDENCE: `npm test -- src/lib/__tests__/notification-outbox.test.ts -t "sends WhatsApp once to the configured group"` → 1 passed (12:07:35)

- [x] G2: sem grupo, fan-out por telefone permanece
  EVIDENCE: `-t "freezes the channel audience"` → 1 passed (12:07:36)

- [x] G3: JID de grupo normaliza e entra na idempotência
  EVIDENCE: `-t "normalizes WhatsApp group JID"` → 1 passed (12:07:38)

- [x] G4: outbox + preferences
  EVIDENCE: 2 Test Files passed; suíte completa `npm test` → 343 passed / 4 skipped (52 files, 12:04:28, 5.36s)

- [x] G5: resumo diário n8n
  EVIDENCE: `RECIPIENTS` live + snapshot = `phones=0 groups=1`; workflow `dailysummaryissued01` active=true

- [x] G6: typecheck
  EVIDENCE: `npm run typecheck` → tsc-ok; `npm run docs:validate` → 62 Markdown files, 22 IDs; `npm run lint` → exit 0

Grupo Evolution `QLMED Fiscal` = `120363411914746947@g.us` (create + sendText ok, remoteJid do grupo).
