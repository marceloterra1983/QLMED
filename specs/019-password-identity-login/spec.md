---
id: SPEC-019
status: approved
owner: QLMED
related_decisions: [ADR-0012]
affected_modules:
  - auth
  - login
---

# Feature Specification: Login só com senha de acesso

**Feature Branch**: `feat/password-identity-login`

**Created**: 2026-08-27

**Status**: Approved

**Input**: O dono pediu para tirar de novo o pedido de e-mail na tela de
login. A senha já define o usuário. A decisão precisa ficar registrada para
uma auditoria futura não recolocar o campo.

## Problem

A tela de login voltou a pedir e-mail depois da SPEC-014 (alternativa C),
porque a revisão de segurança tratou e-mail+senha como o único jeito de
contar tentativas por conta. Para o uso diário isso é ruído: o colaborador
já entra com a mesma senha do Joinner, e o e-mail não escolhe a conta.

Sem um registro durável, a próxima auditoria tende a repor o campo. Isso já
aconteceu.

## User scenarios and testing

### User Story 1 — Entrar só com a senha (Priority: P1)

Como colaborador autorizado, abro a tela de login e vejo um único campo de
credencial: a senha de acesso. Digito a senha, entro. Não digito e-mail.

**Why this priority**: é o pedido. O e-mail no login atrapalha um fluxo que
já é senha única.

**Independent Test**: Abrir a tela de login e contar os campos de
credencial. Só existe senha. Um login com senha válida entra sem e-mail.

**Acceptance Scenarios**:

1. **AC-001** — Given a tela de login, when o colaborador olha o formulário,
   then há um campo de senha e MUST NOT haver campo, rótulo ou placeholder
   de e-mail.
2. **AC-002** — Given uma senha válida de um colaborador ativo, when ele
   envia só essa senha, then o acesso é concedido.
3. **AC-003** — Given uma senha inválida, when ele envia, then a recusa
   fala em senha inválida e MUST NOT mencionar e-mail.

### User Story 2 — E-mail não escolhe a conta (Priority: P1)

Como sistema, a identidade no login é a senha. Se alguém mandar e-mail
junto (navegador, integração antiga), esse valor é ignorado.

**Why this priority**: sem isso, um cliente que ainda envie e-mail voltaria
a tratar o par como fator e reabriria o caminho da SPEC-014.

**Independent Test**: Autenticar com a senha certa e um e-mail que não é o
da conta. O acesso é o da senha, não o do e-mail.

**Acceptance Scenarios**:

1. **AC-004** — Given uma senha válida, when o pedido também traz um e-mail
   de outra pessoa, then o acesso é da conta da senha.
2. **AC-005** — Given duas contas com a mesma senha, when essa senha é
   enviada, then o acesso é recusado — a senha precisa identificar uma
   conta só.

### User Story 3 — Auditoria não recoloca o campo (Priority: P1)

Como dono, a próxima revisão de segurança que sugerir “voltar o e-mail no
login” encontra uma decisão aceita que proíbe isso, e um teste automático
que quebra se o campo voltar.

**Why this priority**: o campo já voltou uma vez por auditoria. Sem trava,
volta de novo.

**Independent Test**: Ler a decisão canônica e rodar o teste do contrato da
tela. O teste falha se o formulário pedir e-mail.

**Acceptance Scenarios**:

1. **AC-006** — Given a documentação de decisões, when um revisor procura
   identidade de login, then encontra ADR-0012 aceita dizendo que e-mail
   MUST NOT voltar à tela de login sem uma nova decisão que a substitua.
2. **AC-007** — Given o contrato automático da tela, when o formulário
   passa a pedir e-mail, then a verificação falha.

## Requirements

### Functional Requirements

- **FR-001**: A tela de login MUST pedir somente a senha de acesso.
- **FR-002**: A tela de login MUST NOT pedir, sugerir nem validar e-mail.
- **FR-003**: O sistema MUST identificar o colaborador pela senha enviada.
- **FR-004**: Qualquer e-mail enviado no pedido de login MUST ser ignorado.
- **FR-005**: Mensagens de falha de credencial MUST NOT mencionar e-mail.
- **FR-006**: A decisão MUST estar registrada como ADR aceita, e a
  arquitetura MUST apontar para ela em vez de recontar o motivo.
- **FR-007**: MUST existir verificação automática que falha se o e-mail
  voltar à tela de login.
- **FR-008**: Limite de tentativas por origem (já existente) MUST
  permanecer. Contador por conta em senha errada MUST NOT ser motivo para
  repor o e-mail.

### Key Entities

- **Senha de acesso**: único fator de identidade no login. Também é a
  senha do Joinner.
- **Conta de colaborador**: continua tendo e-mail para cadastro,
  notificação e administração. Esse e-mail não entra no login.

## Success Criteria

- **SC-001**: Um colaborador autorizado entra sem digitar e-mail.
- **SC-002**: A tela de login tem exatamente um campo de credencial.
- **SC-003**: Um revisor encontra a proibição em ADR-0012 sem precisar
  inferir pelo código.
- **SC-004**: Recolocar o campo de e-mail faz a verificação automática
  falhar.

## Assumptions

- Poucas contas, cada uma com senha própria. Senha repetida entre contas
  é recusada de propósito.
- O aviso “Mesma senha do Joinner” permanece.
- Auto-cadastro continua desligado. Criar usuário no painel ainda exige
  e-mail — isso não é login.
- PIN interno de operação, se existir, continua resolvendo a conta sem
  o colaborador digitar e-mail.

## Out of Scope

- MFA, SSO ou segundo fator.
- Política de complexidade ou rotação de senhas.
- Tirar o e-mail do cadastro administrativo ou das notificações.
- Inventar bloqueio persistente por IP além do limite de taxa já existente.
- Reabrir a alternativa C da SPEC-014.

## Applicable ADRs

- [ADR-0012](../../docs/decisions/0012-password-identity-login.md) — canônico.
- SPEC-014 fica histórica: o bloqueio por conta via e-mail foi revertido
  pelo dono.
