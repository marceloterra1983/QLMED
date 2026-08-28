# Evidence: SPEC-020

- Detector: `npx vitest run src/lib/__tests__/nfe-cancellation.test.ts` — 16 passed.
- Suite: `npm test` — 382 passed, 4 skipped (medido no worktree).
- `npm run docs:validate`, `npx tsc --noEmit`, `npm run lint` verdes.
- `node scripts/test-production-migration-window.cjs` — janela `20260828210000_add_invoice_cancelled_at`.
