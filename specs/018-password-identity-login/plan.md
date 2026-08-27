# Implementation Plan: Login só com senha de acesso

**Branch**: `feat/password-identity-login` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

## Summary

Restaurar o modelo de 21/08 (`5327d9b`): a senha é a identidade no login.
E-mail some da tela e é ignorado no `authorizeCredentials`. A decisão vira
[ADR-0012](../../docs/decisions/0012-password-identity-login.md). Um teste de
contrato quebra se `type="email"` voltar em `src/app/login/page.tsx`.

A SPEC-014 (alternativa C) fica `superseded`. O limite por IP no middleware
permanece. O bloqueio `lockedUntil` só se aplica depois que a senha já
identificou a conta (PIN mapeado ou senha única). Senha errada não incrementa
`failedAttempts` — isso é aceito, não um defeito a “corrigir” com e-mail.

## Technical Context

**Language/Version**: TypeScript / Next.js (App Router)

**Primary Dependencies**: next-auth credentials, bcryptjs, Prisma

**Storage**: sem migration. `User.email` continua existindo; não é fator de login.

**Testing**: Vitest em `src/lib/__tests__/auth-options.test.ts` e
`src/app/login/__tests__/login-page-contract.test.ts`

**Target Platform**: web interno QLMED

**Project Type**: web application

**Constraints**: não restaurar e-mail; não logar senha; não mockar auth de
negócio para ficar verde.

**Scale/Scope**: poucas contas; scan da tabela de usuários por tentativa.

## Constitution Check

| Princípio | Situação |
|---|---|
| I. Evidência executável | Atende — testes de senha-só, e-mail ignorado, contrato da tela. |
| II. Autorização no servidor | Atende — identidade resolvida em `authorizeCredentials`. |
| III. Migrations donas do esquema | N/A — sem schema. |
| IV. Rotas adaptam, `src/lib` implementa | Atende — UI só envia senha; regra fica em `auth-options.ts`. |
| V. Segredos contidos | Atende — senha tentada não entra em log. |
| VI. Uma fonte canônica | Atende — ADR-0012; spec e boundaries só apontam. |

## Project Structure

```text
specs/018-password-identity-login/
├── spec.md
├── plan.md
├── research.md
├── tasks.md
└── checklists/requirements.md

docs/decisions/0012-password-identity-login.md
src/app/login/page.tsx
src/app/login/__tests__/login-page-contract.test.ts
src/lib/auth-options.ts
src/lib/__tests__/auth-options.test.ts
```

## Decisões de projeto

### D1 — Identidade = senha (scan + bcrypt, um match)

`findUserByPassword` percorre os usuários e exige exatamente um hash
compatível. Zero ou dois+ matches: recusa. E-mail no payload é ignorado.

### D2 — PIN interno sem campo na tela

`PIN_MAP_JSON` resolve e-mail no servidor. O colaborador não digita e-mail.

### D3 — Força bruta sem e-mail

Middleware: 5/min por IP e 120/min global no callback de credentials.
Depois da identidade: rate limit por `user.id` + `lockedUntil` se já
estiver travada. Não repor e-mail para reativar incremento em senha errada.

### D4 — Trava anti-auditoria

ADR aceita + frase em `docs/architecture/boundaries.md` + teste que lê o
fonte da tela. Qualquer agente que recolocar o campo quebra CI.

## Quality gates

```bash
npm run docs:validate
npx tsc --noEmit
npm run lint
npx vitest run src/lib/__tests__/auth-options.test.ts src/app/login/__tests__/login-page-contract.test.ts
```

## Escopo excluído

- Contador persistente por IP (alternativa A da SPEC-014).
- MFA, SSO, complexidade de senha.
- Mudança no cadastro administrativo.
