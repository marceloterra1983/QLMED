---
id: SPEC-014
status: superseded
owner: QLMED
affected_modules:
  - auth
  - rate-limit
---

# Feature Specification: Proteção contra força bruta no login

**Feature Branch**: `spec/014-login-bruteforce`

**Created**: 2026-08-26

**Status**: Superseded — em 27/08/2026 o dono reverteu a alternativa C
(e-mail como fator de login). Identidade no login é só a senha:
[ADR-0012](../../docs/decisions/0012-password-identity-login.md),
[SPEC-019](../019-password-identity-login/spec.md). O mecanismo de
bloqueio (temporizadores, desbloqueio admin, log sem senha) permanece
como histórico; não usar esta spec para recolocar e-mail na tela.

**Input**: Revisão de segurança automática sinalizou "Broken Brute-Force Protection" em `src/lib/auth-options.ts`. Investigado e **confirmado**: o mecanismo de bloqueio por conta é código morto desde 21/08/2026.

## O defeito, com a data exata da regressão

`recordFailedLogin` (`src/lib/auth-options.ts:29`) começa com:

```ts
if (!userId) return;
```

E existe **uma única chamada** no arquivo, na linha 115, que passa **`null`**:

```ts
await recordFailedLogin(null, pinEmail || 'unknown', ..., 'user_not_found');
```

Logo: `failedAttempts` nunca é incrementado, `lockedUntil` nunca é definido, e todo o bloco de bloqueio (linhas 128-135), mais as constantes `MAX_FAILED_ATTEMPTS = 10`, `SOFT_LOCK_FAILED_ATTEMPTS = 3` e `LOCKOUT_MS = 15min`, são **inalcançáveis**.

### Quando quebrou, e por quê

O commit `5327d9b` (21/08/2026, *"fix(auth): identificar usuário só pela senha de acesso"*) trocou o modelo de login: o e-mail deixou de ser fator, e a identidade passou a ser a própria senha.

Antes dele havia **quatro** chamadas a `recordFailedLogin`, e duas passavam `user.id` real:

| Chamada anterior | Situação |
|---|---|
| `recordFailedLogin(user.id, ..., 'pin_email_mismatch')` | PIN certo, e-mail errado |
| `recordFailedLogin(user.id, ..., 'bcrypt_mismatch')` | **senha errada para usuário conhecido** |

A segunda era exatamente o caso de força bruta. Com o e-mail fora, não há mais usuário conhecido antes de a senha casar — e uma senha errada não casa com ninguém. **O contador por conta ficou inatingível por construção.**

Não é um `if` esquecido: é incompatibilidade entre "senha é a identidade" e "bloqueio por conta". Qualquer correção precisa resolver essa tensão, não remendá-la.

### Evidência em produção

| Medição | Resultado |
|---|---|
| Usuários com `failedAttempts > 0` | **0** de 8 |
| Usuários com `lockedUntil` definido | **0** de 8 |
| Registros `login_failed` no `AccessLog` | 2, em **26/07 e 20/08** |
| Registros `login_failed` desde 21/08 | **nenhum** |

Os dois registros são anteriores à regressão, o que confirma que o mecanismo funcionava e parou.

## O que resta de proteção hoje

Só limite de taxa, no middleware (`src/middleware.ts:92,156,165`):

- `login`: **5 tentativas/min por IP**, chave `${clientIp}:${pathname}`
- `loginGlobal`: **120 tentativas/min** no total da instância

Isso limita velocidade; não bloqueia. E há um agravante próprio deste desenho: como a senha é a identidade, o atacante não precisa acertar um **par** e-mail+senha — basta acertar **qualquer uma das 8 senhas válidas**. O espaço de busca é o de uma senha só, e o alvo é qualquer conta.

## User Scenarios & Testing

### User Story 1 - Tentativas repetidas param de ser aceitas (Priority: P1)

Uma sequência de senhas erradas passa a esbarrar em bloqueio que persiste, não apenas em atraso.

**Why this priority**: é o defeito. Hoje um atacante distribuído tem 120 tentativas por minuto, indefinidamente, contra oito senhas válidas.

**Independent Test**: emitir N tentativas erradas e verificar que a N+1 é recusada por bloqueio, e continua recusada depois da janela de taxa expirar.

**Acceptance Scenarios**:

1. **Given** o limiar de falhas atingido, **When** vem nova tentativa, **Then** é recusada por bloqueio e não por atraso.
2. **Given** o bloqueio ativo, **When** a janela do limite de taxa expira, **Then** o bloqueio **permanece** — as duas proteções são independentes.
3. **Given** uma tentativa bem-sucedida, **When** o login conclui, **Then** o contador correspondente zera.

---

### User Story 2 - Usuário legítimo não é punido por terceiro (Priority: P1)

Quem tem a senha certa consegue entrar, mesmo que outra pessoa tenha errado antes.

**Why this priority**: mesma prioridade da US1, e é a tensão que decide o desenho. Um contador mal escolhido transforma proteção em negação de serviço — e, neste sistema, um bloqueio global derruba **todos os 8 usuários** de uma vez.

**Acceptance Scenarios**:

1. **Given** falhas vindas de outra origem, **When** o usuário legítimo tenta com a senha certa, **Then** consegue entrar.
2. **Given** vários usuários atrás do mesmo IP, **When** um erra repetidamente, **Then** [NEEDS CLARIFICATION: os demais são afetados? Depende da alternativa escolhida — ver Decisão em aberto.]

---

### User Story 3 - A tentativa falha deixa rastro (Priority: P2)

Toda falha é registrada, permitindo detectar ataque em curso antes de ele ter sucesso.

**Why this priority**: hoje o `AccessLog` não recebe `login_failed` desde 21/08 — um ataque em andamento seria invisível na trilha de auditoria.

**Acceptance Scenarios**:

1. **Given** uma tentativa falha, **When** ela é processada, **Then** há registro no `AccessLog`, mesmo sem usuário identificado.
2. **Given** o registro, **When** é inspecionado, **Then** **não** contém a senha tentada, nem em claro nem em hash.

### Edge Cases

- Usuário atrás de NAT corporativo compartilhando IP com o atacante.
- `x-forwarded-for` forjado: a chave do limite hoje vem de cabeçalho (`middleware.ts:107`), então qualquer contador por IP precisa considerar isso.
- Ataque distribuído: muitos IPs, poucas tentativas cada — o limite por IP não vê.
- Todas as 8 contas bloqueadas ao mesmo tempo: sem caminho de recuperação sem acesso ao banco.
- `PIN_MAP_JSON`: senhas do mapa seguem caminho diferente (`findUnique` por e-mail) e precisam da mesma proteção.

## Requirements

### Functional Requirements

- **FR-001**: Toda tentativa de login falha MUST incrementar algum contador persistente. Nenhum caminho de falha pode sair sem contabilização.
- **FR-002**: Atingido o limiar, novas tentativas MUST ser recusadas por bloqueio, independentemente do limite de taxa.
- **FR-003**: O bloqueio MUST sobreviver a reinício da aplicação — o limite de taxa atual é em memória do processo e não sobrevive.
- **FR-004**: Login bem-sucedido MUST zerar o contador correspondente.
- **FR-005**: Toda falha MUST ser registrada no `AccessLog`, inclusive sem usuário identificado.
- **FR-006**: Nenhum registro MUST conter a senha tentada, em qualquer forma.
- **FR-007**: MUST existir caminho de recuperação documentado para conta ou origem bloqueada, sem acesso direto ao banco.
- **FR-008**: O código morto (constantes e verificações inalcançáveis) MUST ser removido ou tornado alcançável. Manter mecanismo que aparenta proteger e não protege é o defeito que esta spec corrige.
- **FR-009**: A correção MUST ser verificada por reversão: desfeita, o teste de bloqueio reprova.

## Decisão em aberto — três alternativas

Nenhuma é obviamente certa; a escolha é do dono.

### A. Contador por origem (IP)

Substitui o contador por conta por um por IP, persistido.

| | |
|---|---|
| **A favor** | Compatível com "senha é identidade" — não precisa saber quem é para contar. Ataque de uma origem para rápido. |
| **Contra** | Pune usuário legítimo atrás de NAT compartilhado com o atacante. Ineficaz contra ataque distribuído. Depende de `x-forwarded-for`, que é forjável (`middleware.ts:107`). |
| **Risco** | Falsa sensação de proteção contra atacante com muitos IPs. |

### B. Contador global com backoff progressivo

Conta falhas da instância inteira e aumenta o atraso progressivamente.

| | |
|---|---|
| **A favor** | Simples, vê o ataque distribuído, que é o ponto cego de A. |
| **Contra** | **Negação de serviço trivial**: qualquer um derruba o login dos 8 usuários. Neste sistema, com poucas contas, o dano é total. |
| **Risco** | A proteção vira a vulnerabilidade. |

### C. Voltar a exigir e-mail como fator

Restaura o modelo anterior a `5327d9b`, e com ele o contador por conta que funcionava.

| | |
|---|---|
| **A favor** | Restaura mecanismo comprovado. Amplia o espaço de busca de "uma senha" para "par e-mail+senha". Bloqueio por conta não afeta terceiros. |
| **Contra** | **Desfaz uma decisão de produto de 21/08**, cujo motivo não está documentado em ADR nem em spec. Pode ter havido razão de usabilidade que desconheço. |
| **Risco** | Reverter decisão sem conhecer o porquê dela. |

**Observação que atravessa as três**: A e C podem coexistir. Contador por IP e por conta protegem contra ataques diferentes e não se excluem — a pergunta é se o esforço se justifica para 8 usuários.

## Success Criteria

- **SC-001**: Uma sequência de tentativas erradas resulta em recusa por bloqueio, verificada por teste automatizado.
- **SC-002**: O bloqueio persiste após reinício da aplicação.
- **SC-003**: Um usuário legítimo com a senha certa entra, mesmo após falhas de terceiro — conforme a alternativa escolhida.
- **SC-004**: `AccessLog` registra toda falha; hoje registra zero desde 21/08.
- **SC-005**: Nenhum campo de log contém a senha tentada, verificado por teste que varre o registro.
- **SC-006**: Removida a correção, o teste de bloqueio reprova.

## Assumptions

- O sistema segue com poucos usuários (8 hoje), o que torna bloqueio global especialmente perigoso e bloqueio por conta especialmente barato.
- O limite de taxa em memória do processo permanece como camada complementar, não como a proteção principal.

## Out of Scope

- MFA e SSO.
- Política de complexidade de senha.
- Rotacionar as senhas atuais.
- Alterar `PIN_MAP_JSON` como mecanismo, embora ele precise herdar a proteção escolhida.

## Nota de processo

Esta spec descreve e avalia; **não implementa**. Alteração de comportamento de autenticação exige Spec Kit por `AGENTS.md`, e a escolha entre A, B e C é de produto e risco, não técnica. A alternativa C em particular desfaz uma decisão recente do dono, e não seria correto eu a tomar sozinho.
