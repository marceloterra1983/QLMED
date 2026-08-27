# Evidence: SPEC-017 — caption curta do CT-e no WhatsApp

Scope: executar `specs/017-cte-whatsapp-caption/tasks.md`.

## Checks (re-medidos)

- `npx vitest run src/lib/__tests__/cte-whatsapp-caption.test.ts` — 1 file passed (18:54:23)
- `python3 -m unittest -v scripts/test_notification_outbox_worker.py` — 3 tests, OK
- `npm test` — 51 passed | 3 skipped; 359 passed | 4 skipped
- `npx tsc --noEmit` — exit 0
- `npm run lint` — exit 0
- `npm run docs:validate` — 76 Markdown files, 25 IDs

## Gates

5 of 5 em `GATES.md` (G1–G5).
