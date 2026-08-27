# Research: Login só com senha

## Porque o e-mail voltou

A SPEC-014 escolheu a alternativa C (e-mail como fator) para o
`recordFailedLogin(user.id)` voltar a ser alcançável. Sem e-mail, senha
errada não identifica conta, então `failedAttempts` não sobe.

Isso é verdade. O dono aceita essa tensão. A senha continua sendo a
identidade. Proteção restante: limite por IP no middleware, limite global,
e bloqueio só depois que a senha já identificou alguém.

## Porque não reabrir C

O fluxo diário é “mesma senha do Joinner”. Pedir e-mail de novo foi
rejeitado duas vezes (21/08 e 27/08). Sem ADR, auditoria trata a ausência
como omissão e recoloca o campo.

## Caminho técnico

Reusar o desenho de `5327d9b`: `findUserByPassword` + PIN map no servidor.
Manter expiração longa / desbloqueio admin da SPEC-014 para contas já
identificadas. Não inventar persistência nova.

## Fontes

- `src/lib/auth-options.ts` (estado SPEC-014)
- `src/app/login/page.tsx`
- `specs/014-login-bruteforce-protection/spec.md`
- commit `5327d9b`
