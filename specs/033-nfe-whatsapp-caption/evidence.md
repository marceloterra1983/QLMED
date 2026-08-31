# Evidence: SPEC-033 — caption curta da NF-e no WhatsApp

Scope: executar `specs/033-nfe-whatsapp-caption/tasks.md`.

## Checks (re-medidos)

- `npx vitest run src/lib/__tests__/cte-whatsapp-caption.test.ts` — 16 passed
- `python3 -m unittest -v scripts/test_notification_outbox_worker.py` — 5 tests, OK
- `npm run docs:validate` — 144 Markdown files, 41 IDs
- `npx tsc --noEmit` — exit 0
- `npm run lint` — exit 0

## Gates

5 of 5 em `GATES.md` (G1–G5) — ALL MET.
