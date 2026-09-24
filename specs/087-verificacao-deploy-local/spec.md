---
id: SPEC-087
status: approved
owner: QLMED
affected_modules:
  - ci
  - ci-hardening
  - deploy
related:
  - SPEC-013
  - SPEC-084
---

# Feature Specification: Verificação e deploy locais com recibo

**Feature Branch**: `feat/local-release-gate`

**Created**: 2026-09-23

**Status**: Approved

**Input**: O portão de merge para produção depende hoje do resultado do
GitHub Actions. O dono quer emitir esse veredicto na própria máquina, sem
perder o isolamento que [SPEC-013](../013-ci-runner-isolation/spec.md)
conquistou: a suíte continua a correr dentro do contentor isolado, nunca
como `marce` no host.

## Problem

A autoridade do merge vive fora da máquina do dono. Quando o GitHub para
(bloqueio de cobrança, fila, ruleset), nada entra em `main` mesmo com a
suíte a passar localmente. Ao mesmo tempo, a alternativa ingénua — correr
`npm ci` e os testes como `marce` no host — é exactamente o que
[SPEC-013](../013-ci-runner-isolation/spec.md) FR-001 proíbe: esse
utilizador pertence ao grupo `docker`, alcança o writer fiscal e os
backups.

A saída é separar **invocador** de **ambiente de execução**. O ambiente
continua a ser o contentor isolado. Só o invocador deixa de ser o
Actions e passa a ser um `docker exec` disparado no host.

## Roles and ownership

| Papel | Responsabilidade | Fronteira |
|---|---|---|
| Dono (`marce`, host) | Invoca o portão, lê o veredicto, faz o merge local e autoriza o deploy | MUST NOT executar a suíte de release no próprio host |
| Contentor `github-runner-qlmed-ci-linux-01-runner-linux-1` | Único ambiente de execução do portão: uid `10001`, rede `internal`, sem socket Docker do host, sem `/home/marce` montado | Só alcança o sidecar `qlmed-ci-db:5432` |
| Sidecar `qlmed-ci-db` | PostgreSQL descartável, base `qlmed_ci` | MUST NOT ser o writer canónico |
| Recibo em `/home/marce/qlmed/var/release-receipts/` | Prova, no host, de que o portão terminou com `exit 0` | Escrito só pelo orquestrador, nunca de dentro do contentor |
| GitHub | Espelho (`push`) do histórico local | Deixa de ser autoridade de merge |

O contexto de empresa, a autorização de aplicação e o writer fiscal não
mudam nesta feature. Nenhum passo desta spec grava no `postgres` de
produção.

## Acceptance criteria

1. **AC-087-001** — O portão de release corre **dentro** do contentor
   `github-runner-qlmed-ci-linux-01-runner-linux-1`, como uid `10001`, na
   rede `internal`, com o sidecar `qlmed-ci-db:5432` como único
   PostgreSQL alcançável.
2. **AC-087-002** — Invocar o portão como `marce` no host é recusado.
   Executar a suíte de release fora do contentor isolado não produz
   veredicto válido e não produz recibo.
3. **AC-087-003** — No modo interno, o portão exige `RUNNER_NAME` a
   corresponder a `^qlmed-ci-linux-[0-9]{2}$` e recusa qualquer outro
   nome.
4. **AC-087-004** — No modo interno, o portão exige `DATABASE_URL` com
   host `qlmed-ci-db`, porta `5432` e base `qlmed_ci`. URL com
   `127.0.0.1:5433` ou `127.0.0.1:5435` é recusada: nenhuma dessas é o
   banco deste portão (`5433` é o replay de migração no host, `5435` é o
   túnel para o writer da vps2 — [ADR-0020](../../docs/decisions/0020-omarchy-next-canonical-writer-tunnel.md)).
5. **AC-087-005** — O portão recusa arrancar se o contentor tiver um
   `Runner.Worker` activo, para não colidir com um job do Actions em
   curso no mesmo contentor.
6. **AC-087-006** — O recibo é escrito em
   `/home/marce/qlmed/var/release-receipts/<sha>.json`, pelo orquestrador
   no host, **só depois** de `exit 0` dentro do contentor. Saída
   diferente de zero não escreve recibo e não deixa recibo parcial.
7. **AC-087-007** — O recibo identifica o SHA verificado (40 hex
   minúsculos), o runner, o instante de fim, o veredicto e o `sha256` do
   log da execução.
8. **AC-087-008** — O deploy local recusa quando não existe recibo para
   o SHA pedido, e recusa quando o SHA não é o tip de `main` local ou
   quando `origin/main` não é ancestral desse SHA.
9. **AC-087-009** — Nesta onda o deploy local **para antes** do `release`
   na vps2: não abre SSH de deploy por omissão e termina imprimindo
   `DRY_RUN_OK`.
10. **AC-087-010** — O GitHub passa a ser espelho: o histórico local é
    empurrado para lá, e o resultado do Actions não é condição de merge.
11. **AC-087-011** — A autoridade do merge para produção é o recibo local
    emitido no contentor isolado somado à revisão humana no merge local,
    conforme a emenda 2.0.0 da constituição e
    [ADR-0021](../../docs/decisions/0021-verificacao-e-deploy-locais.md).
12. **AC-087-012** — [SPEC-013](../013-ci-runner-isolation/spec.md) FR-001
    continua verdadeiro: nenhum passo desta feature executa a suíte num
    ambiente com acesso a dado de produção, ao grupo `docker` do host ou
    à rede do host.

## Falhas

| Falha | Comportamento exigido |
|---|---|
| Contentor isolado parado ou inexistente | Recusa explícita, sem fallback para o host. Sem recibo. |
| `RUNNER_NAME` ausente ou fora do padrão | Recusa no modo interno. Sem recibo. |
| `DATABASE_URL` a apontar para `127.0.0.1:5433`, `127.0.0.1:5435` ou para o writer canónico | Recusa antes de qualquer consulta. Sem recibo. |
| `Runner.Worker` activo no contentor | Recusa antes de copiar a árvore. Sem recibo. |
| Suíte reprova dentro do contentor | Veredicto negativo propagado, recibo **não** escrito. |
| Recibo ausente para o SHA no deploy local | Recusa do deploy. |
| Recibo presente mas SHA não é tip de `main` local, ou `origin/main` não é ancestral | Recusa do deploy. |
| Directório de recibos inexistente | Criado pelo orquestrador; falha de escrita é erro, não aviso. |

Mensagens de recusa em inglês, com prefixo `Refusing`, como os scripts de
deploy já existentes. Falha silenciosa é proibida: recusa devolve saída
diferente de zero.

## Non-functional requirements

- O portão não monta `/home/marce` no contentor. A árvore verificada
  entra por `git archive` do SHA mais `docker cp`.
- Nenhum passo lê `.env`, certificados ou backups do host.
- O recibo é ficheiro local; não é segredo e não contém credenciais.
- O deploy local não contacta a vps2 por omissão.

## Applicable ADRs

- [ADR-0021](../../docs/decisions/0021-verificacao-e-deploy-locais.md) —
  verificação e deploy locais; o invocador do job muda, o isolamento não.
- [ADR-0020](../../docs/decisions/0020-omarchy-next-canonical-writer-tunnel.md) —
  writer canónico na vps2 e o significado de `5435`.
- [ADR-0007](../../docs/decisions/0007-single-canonical-database.md) —
  base canónica única e `qlmed_ci` descartável.

## Test strategy

- Testes de recusa em estilo `scripts/test-deploy-guard.sh`: cada recusa
  provada, sem rede e sem Docker nos testes.
- O modo interno é exercitado com `RUNNER_NAME` e `DATABASE_URL`
  fabricados, provando recusa para cada variante proibida.
- `npm run docs:validate` cobre este contrato documental.

## Out of scope

- Desligar, apagar ou alterar qualquer workflow do GitHub, incluindo
  `ci.yml` e `deploy-production.yml`. Esta spec **não** desliga
  workflows.
- Alterar o ruleset de `main` (o check exigido, a proibição de push
  directo, a proibição de force-push). Fica para outra onda.
- Executar `release` ou `up` na vps2, e abrir SSH de deploy.
- Migrar `deploy-production.yml` para fora de `qlmed-prod`
  ([SPEC-013](../013-ci-runner-isolation/spec.md) FR-005 permanece).
- Provisionar ou reconfigurar o pool de runners isolados.
- Qualquer mudança em `package.json`, `governance.yaml` ou `.env`.
