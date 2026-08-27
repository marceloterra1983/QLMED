# Evidence: SPEC-019 / ADR-0012

## Testes do recorte

```
npx vitest run src/lib/__tests__/auth-options.test.ts src/app/login/__tests__/login-page-contract.test.ts
Test Files  2 passed (2)
Tests  17 passed (17)
```

## Suíte

```
npm test
Test Files  52 passed | 3 skipped (55)
Tests  358 passed | 4 skipped (362)
```

## Qualidade

```
npm run docs:validate
Documentation validation passed (82 Markdown files, 27 IDs).

npx tsc --noEmit
(ok)

npm run lint
(ok)
```

## Contrato da tela

`src/app/login/__tests__/login-page-contract.test.ts` falha se
`type="email"`, `setEmail` ou `autoComplete="email"` voltarem a
`src/app/login/page.tsx`.
