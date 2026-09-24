---
id: ADR-0021
status: accepted
date: 2026-09-23
related_specs:
  - SPEC-087
  - SPEC-013
---

# ADR-0021 — Verificação e deploy locais, com recibo emitido no contentor isolado

- **Status:** accepted
- **Date:** 2026-09-23
- **Related specs:** [SPEC-087](../../specs/087-verificacao-deploy-local/spec.md),
  [SPEC-013](../../specs/013-ci-runner-isolation/spec.md)

## Context

O veredicto que autoriza merge para produção é hoje o resultado do GitHub
Actions. Isso já parou o QLMED por motivo alheio ao código: em agosto de
2026 o bloqueio de cobrança da conta fez o GitHub **não criar** os jobs, e
`main` ficou fechada com a suíte a passar. O dono quer o veredicto na
própria máquina.

O atalho óbvio — correr a suíte como `marce` no host — é o que
[SPEC-013](../../specs/013-ci-runner-isolation/spec.md) FR-001 proíbe, e a
proibição continua certa: `marce` pertence ao grupo `docker` (root na
prática), alcança o túnel do writer fiscal, os certificados e os backups.
`npm ci` executa scripts de instalação de centenas de pacotes; uma
dependência comprometida teria caminho directo para produção.

A distinção que resolve o conflito é entre **quem invoca** o job e **onde
o job corre**. Até aqui os dois eram o Actions. São separáveis.

## Decision drivers

- O veredicto tem de existir sem depender da disponibilidade do GitHub.
- O isolamento de [SPEC-013](../../specs/013-ci-runner-isolation/spec.md)
  FR-001 não pode ser relaxado.
- O deploy tem de exigir prova verificável, não confiança na memória do
  agente ou do operador.
- O writer canónico da vps2 ([ADR-0020](./0020-omarchy-next-canonical-writer-tunnel.md))
  continua inalcançável a partir do portão.

## Considered options

### Option A — manter o Actions como autoridade

Sem trabalho novo, mas mantém a dependência que já bloqueou `main` por
cobrança e mantém o veredicto fora da máquina do dono. Recusada.

### Option B — correr a suíte como `marce` no host

Rápido e local, e viola
[SPEC-013](../../specs/013-ci-runner-isolation/spec.md) FR-001. Dá a
`npm ci` o grupo `docker`, o túnel do writer e os backups. Recusada.

### Option C — trocar só o invocador: `docker exec` no mesmo contentor isolado (selected)

O ambiente de execução é exactamente o mesmo que o Actions usava — o
contentor `github-runner-qlmed-ci-linux-01-runner-linux-1`, uid `10001`,
rede `internal`, sidecar `qlmed-ci-db:5432`. Muda apenas quem dispara o
job. O isolamento é preservado por construção, porque é o mesmo contentor.

## Decision

1. **O invocador do job passa a ser `docker exec`**, disparado no host,
   contra o contentor `github-runner-qlmed-ci-linux-01-runner-linux-1`. O
   Actions deixa de ser o invocador obrigatório; o ambiente de execução é
   o mesmo de antes.
2. **O ambiente de execução não muda.** O portão corre dentro desse
   contentor, como uid `10001`, na rede `internal`, com o sidecar
   `qlmed-ci-db:5432` (base `qlmed_ci`) como único PostgreSQL alcançável.
   `/home/marce` não é montado; a árvore entra por `git archive` do SHA
   mais `docker cp`.
3. **Correr o portão de release como `marce` no host é proibido.**
   [SPEC-013](../../specs/013-ci-runner-isolation/spec.md) FR-001
   permanece em vigor, sem excepção para este fluxo.
4. **`127.0.0.1:5433` e `127.0.0.1:5435` não são o banco deste portão.**
   `5433` é o replay de migração no host; `5435` é o túnel para o writer
   da vps2 ([ADR-0020](./0020-omarchy-next-canonical-writer-tunnel.md)).
   O modo interno recusa `DATABASE_URL` que contenha qualquer uma delas, e
   exige host `qlmed-ci-db`, porta `5432`, base `qlmed_ci`
   ([ADR-0007](./0007-single-canonical-database.md)).
5. **O recibo é a prova.** Depois de `exit 0` dentro do contentor, o
   orquestrador no host escreve
   `/home/marce/qlmed/var/release-receipts/<sha>.json` com o SHA, o
   runner, o instante de fim, o veredicto e o `sha256` do log. Saída
   diferente de zero não escreve recibo. O recibo nunca é escrito de
   dentro do contentor.
6. **O deploy local exige recibo.** Sem recibo do SHA pedido, recusa. Sem
   o SHA ser o tip de `main` local, recusa. Sem `origin/main` ancestral do
   SHA, recusa.
7. **Nesta onda o deploy local para antes do `release` na vps2.** Imprime
   `DRY_RUN_OK` e não abre SSH de deploy por omissão.
8. **A autoridade do merge para produção é o recibo local mais a revisão
   humana no merge local.** O GitHub passa a ser espelho (`push`) do
   histórico. Esta decisão **não** desliga workflows nem altera o ruleset
   de `main`: isso é trabalho separado, fora do âmbito de
   [SPEC-087](../../specs/087-verificacao-deploy-local/spec.md).

## Consequences

### Positive

- O veredicto deixa de depender da conta de faturação, da fila ou da
  disponibilidade do GitHub.
- O isolamento é o mesmo de antes, porque o contentor é o mesmo.
- O deploy passa a exigir um artefacto verificável, com SHA e hash de log,
  em vez de afirmação.

### Negative

- O portão depende do contentor estar de pé; se estiver parado, recusa sem
  fallback — comportamento herdado de
  [SPEC-013](../../specs/013-ci-runner-isolation/spec.md).
- Invocador local e Actions partilham o mesmo contentor, por isso o portão
  tem de recusar quando encontra um `Runner.Worker` activo.
- Enquanto o ruleset de `main` continuar a exigir o check do Actions, o
  merge local convive com essa exigência; a remoção fica para outra onda.

## Verification

- `docker exec` no contentor mostra uid `10001` e resolve `qlmed-ci-db`.
- O modo interno recusa `RUNNER_NAME` fora de `^qlmed-ci-linux-[0-9]{2}$`.
- O modo interno recusa `DATABASE_URL` com `127.0.0.1:5433` ou
  `127.0.0.1:5435`.
- Suíte reprovada não deixa ficheiro em
  `/home/marce/qlmed/var/release-receipts/`.
- `scripts/deploy-local.sh` recusa SHA sem recibo e termina em
  `DRY_RUN_OK` quando o recibo existe.
