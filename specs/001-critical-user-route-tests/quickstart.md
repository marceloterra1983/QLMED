# Quickstart: verify the pilot

```bash
npm run docs:validate
npx vitest run src/lib/__tests__/users-route.test.ts
npx tsc --noEmit
npm run lint
npm test
npm run build
```

No environment secret, database or external service is required by the focused
test.

