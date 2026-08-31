---
id: SPEC-013
status: approved
owner: QLMED
affected_modules:
  - ci
  - ci-hardening
---

# Feature Specification: CI em runner isolado, fora do host de produção

**Feature Branch**: `feat/spec-013-isolated-ci`

**Created**: 2026-08-26

**Status**: Approved

**Input**: O CI do QLMED não produziu execução alguma entre 21/08 e 26/08 por bloqueio de cobrança do GitHub Actions, travando merge e deploy atrás de um CI que não conseguia existir.

## Contexto: por que o CI parou, e por que o atalho óbvio é proibido

Os quatro jobs de `ci.yml` usavam `ubuntu-24.04`, runner hospedado pelo GitHub, que consome minutos faturáveis. Em 21/08 a conta entrou em bloqueio de cobrança e o GitHub **parou de criar os jobs** — não é job falhando, é job não existindo. Medido: `steps=0`, 2 a 4 segundos, e a anotação `"The job was not started because recent account payments have failed or your spending limit needs to be increased"`.

O atalho aparente seria apontar o CI para o runner self-hosted que o QLMED já tem, `qlmed-prod`. O repositório **proíbe isso**, e a proibição está certa. `scripts/verify-ci-hardening.sh`, adicionado em 17/08 no commit `b0acd0e` ("apply audit remediation hardening"), originalmente afirmava:

```bash
if grep -Eq 'self-hosted|qlmed-prod' "$workflow"; then exit 1; fi
grep -q 'ubuntu-24\.04' "$workflow"
```

O motivo: o CI roda `npm ci`, que executa scripts de instalação de centenas de pacotes. Em runner hospedado isso ocorre numa VM descartável. No `qlmed-prod` ocorreria como usuário `marce`, na máquina que hospeda o banco fiscal de produção, o n8n, as credenciais e os backups — com acesso ao grupo `docker`, que é root na prática. Uma dependência comprometida teria caminho direto para produção.

**Verificado empiricamente em 26/08**, antes de reverter: apontar o `ci.yml` para `qlmed-prod` faz o CI voltar a executar (o job `changes` passou em 11s), e faz o job `app` reprovar no guarda de hardening. Os dois efeitos são reais, e o segundo é o desejado.

### A distinção que esta spec introduz

A regra antiga proibia a **string** `self-hosted`. O que a auditoria quis proteger é o **host de produção**. São coisas diferentes, e a diferença tem consequência prática:

| | `qlmed-prod` | Runner isolado `qlmed-ci-linux-01` |
|---|---|---|
| Execução | systemd, usuário `marce`, no host | container, uid 10001 |
| Privilégios | grupo `docker` — root na prática | `privileged: false` |
| Socket de container | acesso total | ausente |
| Rede | host | `runner-internal` (`internal: true`) + proxy de egresso |
| Alcança | banco fiscal, n8n, credenciais, backups | só o próprio `_work`, cache, logs e o sidecar `qlmed-ci-db` |

O QLMED **é repositório público**. Isolamento **não** é visibilidade. Isolamento é o contentor + overlay + `approval_policy: all_external_contributors` + guarda de origem no YAML (igual ao Farol). Um `if` no workflow não é fronteira contra YAML de fork depois de Approve.

`deploy-production.yml` continua em `qlmed-prod` (`runs-on: [qlmed-prod]`, environment `production`, só `workflow_dispatch`).

### Banco de CI

`app` deixou de declarar `services: postgres`. Service containers exigem socket de engine; o isolado não expõe. O Postgres é um sidecar na mesma `runner-internal`, hostname `qlmed-ci-db`, porta 5432, role `qlmed_ci` **não-superuser**, database `qlmed_ci`.

A URL usa `schema=public` numa instância **longeva**. Isolamento entre jobs = `DROP SCHEMA public CASCADE` + `CREATE SCHEMA public` no início de `app` (equivalente a DROP/CREATE DATABASE sem privilégio `CREATEDB`). **Não** há schema-por-`GITHUB_RUN_ID`.

## User Scenarios & Testing

### User Story 1 - CI que não depende de cobrança (Priority: P1)

O CI do QLMED executa em runner isolado. Um problema de pagamento ou de limite de gasto na conta do GitHub deixa de impedir que o repositório tenha CI.

**Why this priority**: é a motivação inteira. Cinco dias sem nenhuma execução, com merge e deploy travados atrás de um portão que não podia abrir.

**Independent Test**: abrir um PR e observar os jobs concluírem no `qlmed-ci-linux-01` com resultado real.

**Acceptance Scenarios**:

1. **Given** um PR interno, **When** o CI corre, **Then** os jobs executam em `qlmed-ci-linux-01` e reportam aprovação ou reprovação de verdade.
2. **Given** um job em execução, **When** seu runner é inspecionado, **Then** ele não é `qlmed-prod-runner`.
3. **Given** um job de CI, **When** ele tenta alcançar o banco canônico, o n8n, `/srv` do host ou o socket Docker, **Then** não consegue.

---

### User Story 2 - O job com banco continua funcionando (Priority: P1)

O job `app` — que roda typecheck, testes, build e os verificadores de migration — continua obtendo PostgreSQL.

**Why this priority**: mesma prioridade da US1 porque sem ela a US1 não vale nada. `app` é onde está a substância do CI.

**Acceptance Scenarios**:

1. **Given** um runner sem socket de container, **When** `app` roda, **Then** ele alcança `qlmed-ci-db:5432` e conclui.
2. **Given** o banco de CI, **When** qualquer job conecta, **Then** o alvo é o descartável `qlmed_ci`, nunca o canônico `postgres`.
3. **Given** duas execuções consecutivas, **When** a segunda começa, **Then** o schema `public` foi destruído e recriado; nada da execução anterior persiste.

---

### User Story 3 - O guarda passa a dizer o que quer dizer (Priority: P2)

`verify-ci-hardening.sh` continua reprovando um `ci.yml` que rode CI no host de produção, e deixa de reprovar um que rode no selector isolado.

**Why this priority**: sem isso a migração não entra — o guarda antigo reprova qualquer `self-hosted`. Ele precisa ficar **mais preciso**, nunca mais permissivo.

**Acceptance Scenarios**:

1. **Given** um `ci.yml` apontando para `qlmed-prod`, **When** o guarda roda, **Then** reprova.
2. **Given** um `ci.yml` apontando para o array exacto do binding, **When** o guarda roda, **Then** aprova.
3. **Given** a correção revertida, **When** o guarda roda contra `qlmed-prod`, **Then** reprova — verificado por reversão, não por leitura.
4. **Given** `runs-on: self-hosted` sozinho, **When** o guarda roda, **Then** reprova.
5. **Given** `ubuntu-24.04` de volta no CI, **When** o guarda roda, **Then** reprova.

### Edge Cases

- Runner isolado fora do ar: o CI para por inteiro, sem fallback hospedado.
- Concorrência: um listener serializa `docs`, `app` e `quality`.
- O proxy de egresso precisa permitir o registry do npm.
- Node 22 vem de `actions/setup-node`, não da imagem.
- `deploy-production.yml` continua em `qlmed-prod` e NÃO é migrado.
- PR de fork: a setting `all_external_contributors` é a fronteira; o `if` de origem no YAML é defesa em profundidade.

## Requirements

### Functional Requirements

- **FR-001**: O CI do QLMED MUST NOT executar em `qlmed-prod`, nem em runner com acesso a dado de produção, ao grupo `docker`, ou à rede do host.
- **FR-002**: O job `app` MUST obter PostgreSQL sem service containers.
- **FR-003**: O banco de CI MUST ser `qlmed_ci`. O banco canônico `postgres` MUST ser inalcançável a partir do CI, garantido por isolamento de rede e não por convenção de configuração.
- **FR-004**: `verify-ci-hardening.sh` MUST continuar reprovando `qlmed-prod` em `ci.yml` e MUST aceitar o runner isolado. MUST NOT ser relaxado para aceitar qualquer runner self-hosted.
- **FR-005**: `deploy-production.yml` MUST permanecer em `qlmed-prod`.
- **FR-006**: O CI MUST NOT conseguir ler `.env`, certificados ou backups do host.
- **FR-007**: A mudança do guarda MUST ser verificada por reversão: reintroduzido `qlmed-prod`, o guarda reprova.
- **FR-008**: Nenhum workflow MUST disparar `pull_request_target`, `workflow_run` ou `issue_comment`.
- **FR-009**: `ci.yml` e `ai-tooling-drift.yml` MUST usar o array exacto do binding (`self-hosted` + labels de `validation-linux-pool`). MUST NOT haver fallback `ubuntu-24.04`. MUST NOT haver label extra `qlmed-ci`.
- **FR-010**: O job `app` MUST destruir e recriar o schema `public` no sidecar no início da execução. MUST NOT usar schema-por-`GITHUB_RUN_ID`.

### Key Entities

- **Banco de CI**: PostgreSQL sidecar longevo na `runner-internal`, database `qlmed_ci`, role sem SUPERUSER. Isolamento entre jobs por reset do schema `public`, não por instância efémera nem por schema por run.

## Success Criteria

- **SC-001**: Um PR do QLMED conclui o CI com resultado real de aprovação ou reprovação no runner isolado.
- **SC-002**: Nenhum job de CI reporta `runner_name = qlmed-prod-runner`.
- **SC-003**: De dentro de um job de CI, o banco canônico, as bridges `qlmed_*`, `/srv` do host e o socket do Docker do host são todos inalcançáveis — verificado por teste que tenta e precisa falhar.
- **SC-004**: `verify-ci-hardening.sh` reprova um `ci.yml` apontado para `qlmed-prod`, verificado por reversão.
- **SC-005**: `db:migrate:verify` e `db:reconcile:verify` passam no CI, como já passam localmente.

## Assumptions

- O QLMED é repositório **público**. Isolamento = contentor + overlay + approval de forks + guarda de origem; não visibilidade.
- O runner isolado `qlmed-ci-linux-01` já existe na plataforma (slot 4 no `server`).

## Out of Scope

- Provisionar o runner isolado (plataforma, fase 1).
- Migrar `deploy-production.yml` (FR-005).
- Alterar `publicAllowed` / schema de labels da plataforma.
- Resolver o bloqueio de cobrança do GitHub.

## Nota de sequenciamento

A plataforma (`qlmed-ci-linux-01`) é pré-requisito desta spec. Sem fallback hospedado: se o isolado cair, o CI pára.
