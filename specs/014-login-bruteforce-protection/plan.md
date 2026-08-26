# Implementation Plan: Proteção contra força bruta no login

**Branch**: `spec/014-login-bruteforce` | **Date**: 2026-08-26 | **Spec**: [spec.md](./spec.md)

## Alternativa escolhida: C — e-mail volta a ser fator

Decidido pelo dono em 2026-08-26.

### O que a investigação mudou depois da spec

A spec registrava, como principal contra da alternativa C, que ela **desfaria uma decisão de produto de 21/08 cujo motivo não estava documentado**. O motivo foi encontrado, e ele **não vale mais**.

A mensagem do commit `5327d9b` diz:

> *"A tela inicial pedia e-mail, mas o cadastro trata a senha como identidade."*

A mudança corrigia uma **inconsistência entre login e auto-cadastro**. Verificado hoje:

| Verificação | Estado atual |
|---|---|
| `src/app/register/page.tsx` | `redirect('/login')` — desativado |
| `src/app/api/register/route.ts` | `403 "Cadastro desabilitado"` |
| Criação de usuário por admin (`api/users/route.ts:52-68`) | **exige e-mail**, tratado como chave única |
| Usuários com e-mail preenchido | **8 de 8** |

O auto-cadastro que motivou a mudança não existe mais. E o resto do sistema **já trata e-mail como identidade** — a criação por admin rejeita duplicata por `where: { email }`. A inconsistência hoje é a oposta da de 21/08: o login é o único lugar que ignora o e-mail.

Logo, C deixou de ser "reverter uma decisão" e passou a ser "realinhar o login com o que o sistema já faz". O contra principal caiu.

### Por que C, e não A ou B

- **B (contador global)** continua descartada: com 8 usuários, um atacante derruba o login de todos. A proteção viraria a vulnerabilidade.
- **A (contador por IP)** continua útil, mas insuficiente sozinha — cega a ataque distribuído, e a chave vem de `x-forwarded-for` (`middleware.ts:107`), que é forjável.
- **C** restaura o contador por conta, que é o único que resiste a ataque distribuído, porque conta por alvo e não por origem.

C e A podem coexistir depois. Este plano entrega C.

### O ganho que não é só o bloqueio

Com e-mail como fator, o espaço de busca deixa de ser "qualquer uma das 8 senhas" e passa a ser "o par e-mail+senha de uma conta específica". Mesmo antes de qualquer bloqueio, o ataque fica ordens de magnitude mais caro.

## Technical Context

**Arquivos afetados**: `src/lib/auth-options.ts` (autorização), `src/app/login/page.tsx` (formulário), `src/lib/__tests__/auth-options.test.ts` (testes existentes).

**Sem mudança de esquema**: `failedAttempts` e `lockedUntil` já existem em `User` e estão zerados nos 8 registros. Nenhuma migration.

**Sem mudança de dados**: os 8 usuários já têm e-mail.

## Constitution Check

| Princípio | Situação |
|---|---|
| I. Evidência executável | Atende — teste que exige bloqueio após N falhas, provado por reversão (FR-009). |
| II. Autorização no servidor | Atende — a mudança é inteiramente em `authorizeCredentials`. |
| III. Migrations donas do esquema | N/A — sem mudança de esquema. |
| IV. Rotas adaptam, `src/lib` implementa | Atende — a lógica fica em `auth-options.ts`. |
| V. Segredos contidos | Atende — FR-006 proíbe a senha tentada em qualquer log. |
| VI. Uma fonte canônica | Atende — o e-mail volta a ser a identidade em login e criação. |

## Decisões de projeto

### D1 — `bcrypt_mismatch` volta a ser o caminho que conta

Restaurado o fluxo anterior a `5327d9b`: busca o usuário **por e-mail**, depois compara a senha. Isso devolve o único ponto capaz de dizer *"esta conta específica errou a senha"* — que é onde `recordFailedLogin(user.id, ...)` passa a ser chamado.

### D2 — Resposta idêntica para e-mail inexistente e senha errada

O erro devolvido MUST ser o mesmo nos dois casos. Caso contrário, o login vira oráculo de enumeração de contas: um atacante descobriria quais e-mails existem antes de tentar senhas.

Consequência aceita: e-mail inexistente não incrementa contador algum (não há conta). Esse vetor fica coberto pelo limite de taxa por IP, e por uma eventual alternativa A no futuro.

### D3 — `PIN_MAP_JSON` herda a mesma proteção

O mapa de PIN resolve o usuário por e-mail (`findUnique`), então já tem `user.id` disponível. Suas falhas MUST chamar `recordFailedLogin` com esse id, como faziam antes de 21/08 (`pin_email_mismatch`).

### D4 — Código morto sai

As constantes e o bloco de bloqueio deixam de ser inalcançáveis, então permanecem. Mas FR-008 exige que **nada** que aparente proteger fique sem efeito: a verificação será por teste, não por leitura.

### D5 — Recuperação de conta bloqueada

`MAX_FAILED_ATTEMPTS = 10` é bloqueio permanente até intervenção. Com 8 usuários e um deles sendo o dono, bloquear a própria conta sem caminho de saída é risco real.

[NEEDS CLARIFICATION: a recuperação deve ser (a) admin destravando em Sistema › Usuários, (b) expiração automática após período maior, ou (c) as duas? A opção (a) falha se a conta bloqueada for a única admin.]

## Estratégia de testes

Ordem deliberada — os casos de falha primeiro, porque o defeito é ausência de bloqueio.

1. **Reversão obrigatória**: removida a chamada com `user.id`, o teste de bloqueio reprova. É a prova de que o teste protege algo — o mecanismo atual passa em toda suíte existente justamente por nunca ser exercitado.
2. Senha errada para e-mail existente incrementa `failedAttempts`.
3. Atingido `SOFT_LOCK_FAILED_ATTEMPTS`, `lockedUntil` é definido e a próxima tentativa é recusada.
4. Atingido `MAX_FAILED_ATTEMPTS`, a recusa persiste após `lockedUntil` expirar.
5. Login bem-sucedido zera contador e lock.
6. E-mail inexistente e senha errada produzem **a mesma** mensagem (D2).
7. Nenhum log contém a senha tentada — varredura do registro gravado.
8. Falha do PIN incrementa o contador da conta correspondente.

## Quality gates

```bash
npm run docs:validate && npx tsc --noEmit && npm run lint && npm test && npm run build && npm run ci:verify
```

Sem verificadores de banco: não há mudança de esquema.

## Escopo excluído

- Alternativa A (contador por IP) — pode vir depois e coexistir.
- MFA, SSO, política de complexidade de senha.
- Rotacionar as senhas atuais.
- Reativar o auto-cadastro.

## Pendência antes da Fase 2

Só D5 — o caminho de recuperação de conta bloqueada. É decisão de operação, e a variante (a) tem um modo de falha real: o dono trancar a própria conta de admin.
