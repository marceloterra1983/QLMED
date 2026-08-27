# Evidence: SPEC-016 — aviso no celular (nota recebida)

- Destinos e payload: `npm test -- src/lib/__tests__/notification-outbox.test.ts src/lib/__tests__/web-push.test.ts` — 17 testes, 2 arquivos.
- `npm run docs:validate` — passed (70 Markdown files, 24 IDs).
- `npx tsc --noEmit` e `npm run lint` — sem erro.
