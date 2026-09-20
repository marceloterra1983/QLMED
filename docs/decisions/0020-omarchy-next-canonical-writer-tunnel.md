---
id: ADR-0020
status: accepted
date: 2026-09-18
supersedes: ADR-0019
related_specs:
  - SPEC-075
---

# ADR-0020 — Next no Omarchy usa o writer canônico da vps2

- **Status:** accepted
- **Date:** 2026-09-18
- **Supersedes:** a cláusula de [ADR-0019](./0019-dev-isolated-restore-vps2-writer.md)
  que proibia o host `dev` de apontar `DATABASE_URL` para o Postgres da vps2.
  Permanecem: writer único na vps2, nome de banco `postgres`, variável única
  `DATABASE_URL`, recusa de `qlmed_dev`, sidecar `qlmed_ci`, n8n aposentado.

## Context

O dono opera duas superfícies Next neste `dev` (`:3000` no checkout e o
preview canônico `:3002`) e precisa que **dados e cadastros feitos aí
sejam os de produção**. O dump isolado em `127.0.0.1:5434` defasa e
esconde o efeito real. O Postgres da vps2 escuta só em `127.0.0.1:5432`
(recusa Tailscale `:5432`).

## Decision drivers

- Um único writer fiscal (vps2).
- Preview e `npm run dev` vêem e gravam o mesmo `postgres` de produção.
- CI e replay de migration não mutam o writer.
- Postgres de produção não se publica na internet nem no Tailscale.

## Considered options

### Option A — dump isolado (ADR-0019)

Seguro para o agente; o operador trabalha em cópia morta.

### Option B — túnel SSH loopback `:5435` → vps2 `:5432` (selected)

O Next humano usa o canônico. Replay/verify continua `qlmed_ci`.
Workers de fundo no preview permanecem desligados.

### Option C — publicar Postgres no Tailscale da vps2

Expõe o writer além de `127.0.0.1`. Recusado.

## Decision

1. Produção: PostgreSQL `postgres` na vps2, `127.0.0.1:5432`.
2. Omarchy: unit `qlmed-prod-db-tunnel` encaminha `127.0.0.1:5435` →
   `vps2:127.0.0.1:5432`. `DATABASE_URL` do Next (`~/qlmed/app/.env`)
   aponta para essa porta, nome `postgres`.
3. Preview `:3002` recusa dump `:5434` e host remoto; exige túnel `:5435`.
4. `QLMED_DISABLE_BACKGROUND_SERVICES=true` no preview (já existente).
5. `npm run db:migrate:verify` / reconcile neste host **só** contra
   `qlmed_ci`. `prisma migrate deploy` no writer continua ROLE-001 /
   workflow de produção.
6. `:5434` pode existir como restore de dump para ensaio; não alimenta
   o Next do operador.

## Consequences

### Positive

- Cadastro e operação no preview valem em `app.qlmed.com.br`.
- Postgres continua bound a loopback na vps2.

### Negative

- `npm run dev` e o preview **escrevem produção**. Seed, script solto
  e `migrate deploy` herdando `.env` são perigosos — o portão de replay
  recusa `postgres` neste host.

## Verification

- `ss` em `127.0.0.1:5435` com a unit de túnel ativa.
- Preview recusa `DATABASE_URL` cuja porta não é `5435`.
- `db:migrate:verify` com URL `postgres` (não `qlmed_ci`) falha.
