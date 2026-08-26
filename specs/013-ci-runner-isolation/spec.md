---
id: SPEC-013
status: draft
owner: QLMED
affected_modules:
  - ci
  - ci-hardening
---

# Feature Specification: CI em runner isolado, fora do host de produção

**Feature Branch**: `spec/013-ci-runner-isolation`

**Created**: 2026-08-26

**Status**: Draft

**Input**: O CI do QLMED não produziu execução alguma entre 21/08 e 26/08 por bloqueio de cobrança do GitHub Actions, travando merge e deploy atrás de um CI que não conseguia existir.

## Contexto: por que o CI parou, e por que o atalho óbvio é proibido

Os quatro jobs de `ci.yml` usam `ubuntu-24.04`, runner hospedado pelo GitHub, que consome minutos faturáveis. Em 21/08 a conta entrou em bloqueio de cobrança e o GitHub **parou de criar os jobs** — não é job falhando, é job não existindo. Medido: `steps=0`, 2 a 4 segundos, e a anotação `"The job was not started because recent account payments have failed or your spending limit needs to be increased"`.

O atalho aparente seria apontar o CI para o runner self-hosted que o QLMED já tem, `qlmed-prod`. O repositório **proíbe isso**, e a proibição está certa. `scripts/verify-ci-hardening.sh`, adicionado em 17/08 no commit `b0acd0e` ("apply audit remediation hardening"), afirma:

```bash
! grep -Eq 'self-hosted|qlmed-prod' "$workflow"
grep -q 'ubuntu-24\.04' "$workflow"
```

O motivo: o CI roda `npm ci`, que executa scripts de instalação de centenas de pacotes. Em runner hospedado isso ocorre numa VM descartável. No `qlmed-prod` ocorreria como usuário `marce`, na máquina que hospeda o banco fiscal de produção, o n8n, as credenciais e os backups — com acesso ao grupo `docker`, que é root na prática. Uma dependência comprometida teria caminho direto para produção.

**Verificado empiricamente em 26/08**, antes de reverter: apontar o `ci.yml` para `qlmed-prod` faz o CI voltar a executar (o job `changes` passou em 11s), e faz o job `app` reprovar no guarda de hardening. Os dois efeitos são reais, e o segundo é o desejado.

### A distinção que esta spec introduz

A regra atual proíbe a **string** `self-hosted`. O que a auditoria quis proteger é o **host de produção**. São coisas diferentes, e a diferença tem consequência prática:

| | `qlmed-prod` | Runner isolado |
|---|---|---|
| Execução | systemd, usuário `marce`, no host | container, uid não privilegiado |
| Privilégios | grupo `docker` — root na prática | `privileged: false` |
| Socket de container | acesso total | ausente |
| Rede | host | isolada, com proxy de egresso |
| Alcança | banco fiscal, n8n, credenciais, backups | só o próprio `_work`, cache e logs |

Este servidor **já opera runners do segundo tipo** para outros repositórios. `deploy-production.yml` continua em `qlmed-prod`, e corretamente: precisa tocar a máquina, roda só por dispatch manual com SHA fixado, e não instala dependências vindas de PR.

## User Scenarios & Testing

### User Story 1 - CI que não depende de cobrança (Priority: P1)

O CI do QLMED executa em runner isolado. Um problema de pagamento ou de limite de gasto na conta do GitHub deixa de impedir que o repositório tenha CI.

**Why this priority**: é a motivação inteira. Cinco dias sem nenhuma execução, com merge e deploy travados atrás de um portão que não podia abrir.

**Independent Test**: com a conta ainda bloqueada para minutos faturáveis, abrir um PR e observar os jobs concluírem com resultado real.

**Acceptance Scenarios**:

1. **Given** a conta sem minutos faturáveis disponíveis, **When** um PR é aberto, **Then** os jobs executam e reportam aprovação ou reprovação de verdade.
2. **Given** um job em execução, **When** seu runner é inspecionado, **Then** ele não é `qlmed-prod`.
3. **Given** um job de CI, **When** ele tenta alcançar o banco canônico, o n8n ou `/srv`, **Then** não consegue.

---

### User Story 2 - O job com banco continua funcionando (Priority: P1)

O job `app` — que roda typecheck, testes, build e os verificadores de migration — continua obtendo PostgreSQL.

**Why this priority**: mesma prioridade da US1 porque sem ela a US1 não vale nada. `app` é onde está a substância do CI.

**O obstáculo**: `app` declara `services: postgres:18-alpine`. Service container do GitHub Actions exige motor de container no runner, e runners isolados não expõem socket — por política, não por limitação. Então o mecanismo precisa ser substituído, não negociado.

**Precedente que já existe**: em 26/08 a suíte inteira e os dois verificadores de migration rodaram contra um PostgreSQL **externo**, num container efêmero com base `qlmed_ci`, sem `services:` — `migrate deploy` replicou o histórico e o diff contra `schema.prisma` deu "No difference detected". O caminho está provado.

**Acceptance Scenarios**:

1. **Given** um runner sem socket de container, **When** `app` roda, **Then** ele alcança um PostgreSQL e conclui.
2. **Given** o banco de CI, **When** qualquer job conecta, **Then** o alvo é o descartável `qlmed_ci`, nunca o canônico `postgres`.
3. **Given** duas execuções simultâneas, **When** ambas usam o banco, **Then** nenhuma enxerga o dado da outra.
4. **Given** uma execução encerrada, **When** o banco é inspecionado, **Then** nada daquela execução persiste para a seguinte.

---

### User Story 3 - O guarda passa a dizer o que quer dizer (Priority: P2)

`verify-ci-hardening.sh` continua reprovando um `ci.yml` que rode CI no host de produção, e deixa de reprovar um que rode em runner isolado.

**Why this priority**: sem isso a migração não entra — o guarda reprova o job `app` por desenho. Mas ele precisa ficar **mais preciso**, nunca mais permissivo.

**Acceptance Scenarios**:

1. **Given** um `ci.yml` apontando para `qlmed-prod`, **When** o guarda roda, **Then** reprova.
2. **Given** um `ci.yml` apontando para o runner isolado, **When** o guarda roda, **Then** aprova.
3. **Given** a correção revertida, **When** o guarda roda contra `qlmed-prod`, **Then** reprova — verificado por reversão, não por leitura.

### Edge Cases

- Runner isolado fora do ar: o CI para por inteiro, sem fallback hospedado. Disponibilidade de um runner vira dependência do CI.
- Concorrência: um runner serializa `docs`, `app` e `quality`, que hoje correm em paralelo. O tempo de parede do CI cresce.
- O proxy de egresso precisa permitir o registry do npm, senão `npm ci` falha.
- Node 22 precisa ser obtenível: `setup-node` baixa para o tool cache, então o proxy precisa permitir, ou a imagem precisa já trazer.
- `deploy-production.yml` continua em `qlmed-prod` e NÃO é migrado.

## Requirements

### Functional Requirements

- **FR-001**: O CI do QLMED MUST NOT executar em `qlmed-prod`, nem em runner com acesso a dado de produção, ao grupo `docker`, ou à rede do host.
- **FR-002**: O job `app` MUST obter PostgreSQL sem service containers.
- **FR-003**: O banco de CI MUST ser `qlmed_ci`. O banco canônico `postgres` MUST ser inalcançável a partir do CI, garantido por isolamento de rede e não por convenção de configuração.
- **FR-004**: `verify-ci-hardening.sh` MUST continuar reprovando `qlmed-prod` em `ci.yml` e MUST aceitar o runner isolado. MUST NOT ser relaxado para aceitar qualquer runner self-hosted.
- **FR-005**: `deploy-production.yml` MUST permanecer em `qlmed-prod`.
- **FR-006**: O CI MUST NOT conseguir ler `.env`, certificados ou backups do host.
- **FR-007**: A mudança do guarda MUST ser verificada por reversão: reintroduzido `qlmed-prod`, o guarda reprova.

### Key Entities

- **Banco de CI**: PostgreSQL descartável, alcançável da rede interna do runner e de nenhum outro lugar. [NEEDS CLARIFICATION: instância efêmera por execução, ou instância longeva com schema por execução? A primeira isola melhor; a segunda é mais barata de operar.]

## Success Criteria

- **SC-001**: Com minutos faturáveis indisponíveis, um PR do QLMED conclui o CI com resultado real de aprovação ou reprovação.
- **SC-002**: Nenhum job de CI reporta `runner_name = qlmed-prod-runner`.
- **SC-003**: De dentro de um job de CI, o banco canônico, `/srv` e o socket do Docker do host são todos inalcançáveis — verificado por teste que tenta e precisa falhar.
- **SC-004**: `verify-ci-hardening.sh` reprova um `ci.yml` apontado para `qlmed-prod`, verificado por reversão.
- **SC-005**: `db:migrate:verify` e `db:reconcile:verify` passam no CI, como já passam localmente.

## Assumptions

- O QLMED permanece repositório **privado**. Runner self-hosted com repositório público é questão separada e muito maior: qualquer PR passaria a executar código na infraestrutura.
- Existe, ou virá a existir, runner isolado capaz de servir este repositório. O provisionamento pertence à plataforma de runners, não a esta spec.

## Out of Scope

- **Provisionar o runner isolado.** É trabalho da plataforma de runners (`~/GitHub_Runners/platform`), que hoje é de feature única e não aceita uma segunda feature sem mudança de governança própria. Esta spec descreve o lado QLMED e depende daquele lado existir.
- Migrar `deploy-production.yml` (FR-005).
- Tornar o QLMED público.
- Resolver o bloqueio de cobrança do GitHub, que é independente e continua sendo o desbloqueio imediato do backlog atual.

## Nota de sequenciamento

Esta spec tem mérito próprio: elimina uma classe inteira de bloqueio e melhora a postura de segurança do CI. Mas **não destrava o backlog atual mais rápido do que resolver a cobrança**, e depende de trabalho na plataforma de runners que ainda não existe. Tratá-la como melhoria planejada, e não como resposta de emergência, é a leitura honesta.
