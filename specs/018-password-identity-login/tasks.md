# Tasks: Login só com senha de acesso

**Input**: [spec.md](./spec.md), [plan.md](./plan.md)

## Phase 1: Contrato e decisão

- [x] T001 Escrever SPEC-018 e checklist em `specs/018-password-identity-login/`
- [x] T002 Escrever ADR-0012 em `docs/decisions/0012-password-identity-login.md`
- [x] T003 Apontar ADR no README e em `docs/architecture/boundaries.md`
- [x] T004 Marcar SPEC-014 como `superseded`

## Phase 2: Testes (US1–US3)

- [x] T005 [P] [US3] Contrato da tela: sem `type="email"` em `src/app/login/__tests__/login-page-contract.test.ts`
- [x] T006 [P] [US1][US2] Reescrever `src/lib/__tests__/auth-options.test.ts` para senha-só, e-mail ignorado, colisão e PIN sem e-mail

## Phase 3: Implementação

- [x] T007 [US1] Tirar e-mail de `src/app/login/page.tsx`
- [x] T008 [US2] Restaurar identidade por senha em `src/lib/auth-options.ts` e ignorar `credentials.email`

## Phase 4: Verificação

- [x] T009 `npm run docs:validate`, `npx tsc --noEmit`, `npm run lint`, testes do recorte
