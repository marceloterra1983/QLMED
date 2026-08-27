---
id: ADR-0012
status: accepted
date: 2026-08-27
supersedes: null
related_specs: [SPEC-018, SPEC-014]
---

# Login identifica o usuário só pela senha — e-mail não volta à tela

## Context

Em 21/08/2026 o login passou a tratar a senha de acesso como identidade
(`5327d9b`). A tela deixou de pedir e-mail. Em 26/08 a SPEC-014 restaurou
o e-mail (alternativa C) para o contador de força bruta por conta voltar
a ser alcançável: sem e-mail, senha errada não aponta conta, então
`failedAttempts` não sobe.

O dono rejeitou essa volta. A senha do Joinner já define o colaborador.
Pedir e-mail no login é ruído. Auditorias de segurança tratam a ausência
como omissão e recolocam o campo — isso já aconteceu.

## Decision drivers

- O fluxo diário é uma senha só, compartilhada com o Joinner.
- E-mail continua no cadastro administrativo e nas notificações; não é
  fator de login.
- Decisão de produto prevalece sobre checklist genérico de “e-mail+senha”.
- A próxima auditoria precisa achar um “não” explícito, não um vazio.

## Considered options

### Option A — Manter e-mail+senha (SPEC-014 C)

Benefício: incrementa `failedAttempts` na conta certa quando a senha
erra. Custo: o colaborador volta a digitar e-mail; o campo reaparece a
cada revisão automática.

### Option B — Senha como identidade, sem e-mail na tela

Benefício: tela e contrato iguais ao uso real. Custo: senha errada não
trava conta específica; a defesa fica no limite por origem e no bloqueio
só depois que a senha já identificou alguém.

### Option C — Segundo fator ou SSO

Fora de escopo. Não foi pedido.

## Decision

Option B.

**NÃO restaurar** o campo de e-mail na tela de login, nem exigir e-mail
em `authorizeCredentials`, para “consertar” força bruta, enumeração,
checklist OWASP, revisão automática ou spec antiga.

Quem quiser e-mail+senha de novo MUST abrir ADR nova que **substitua**
esta, com aprovação do dono. Recolocar o campo sem isso é regressão.

A SPEC-014 permanece como histórico do mecanismo de bloqueio
(temporizadores, desbloqueio admin, logs sem senha). A alternativa C
dessa spec está revertida.

## Consequences

### Positive

- Login alinhado ao uso: uma senha.
- Auditoria encontra proibição canônica em vez de ausência.
- Teste de contrato quebra se `type="email"` voltar à tela.

### Negative

- Contador por conta em senha errada continua inalcançável. Isso é
  aceito, não um bug em aberto.
- Duas contas com a mesma senha não entram — a senha precisa ser única.

### Follow-up

Não implementar alternativa C da SPEC-014. Limite por IP no middleware
permanece. Não inventar bloqueio global (negação de serviço trivial).

## Verification

- `src/app/login/__tests__/login-page-contract.test.ts` falha se a tela
  pedir e-mail.
- `authorizeCredentials` entra com `{ password }` e ignora `email`.
- Esta ADR permanece `accepted` até outra a substituir.
