---
id: ADR-0019
status: superseded
date: 2026-09-17
supersedes: ADR-0007
related_specs: []
---

# ADR-0019 — Isolamento de hosts: dev local e writer vps2

- **Status:** superseded by [ADR-0020](./0020-omarchy-next-canonical-writer-tunnel.md)
  (cláusula “dev não aponta DATABASE_URL à vps2”). Writer vps2, `qlmed_ci` e
  a recusa de `qlmed_dev` permanecem.
- **Date:** 2026-09-17
- **Supersedes:** a parte operacional de [ADR-0007](./0007-single-canonical-database.md)
  que autorizava o processo local a usar o PostgreSQL persistente canônico.
  O nome de banco `postgres` em produção, a variável única `DATABASE_URL`, a
  recusa de `qlmed_dev` e o sidecar efêmero `qlmed_ci` permanecem.

## Contexto

O checkout e o runtime de produção conviviam no mesmo mapa (`server`,
`~/qlmed/production` → `/srv/qlmed`). O writer real já é a `vps2`. O host
Omarchy `dev` precisa desenvolver sem apontar `DATABASE_URL` para o Postgres
da vps2. n8n foi aposentado. O host `server` será destruído.

## Decision drivers

- Um único writer de dados fiscais (vps2).
- Desenvolvimento reproduzível neste `dev` sem mutar produção.
- Sem banco chamado `qlmed_dev`.
- Sem n8n.

## Considered options

### Option A — restore isolado no host de desenvolvimento (selected)

Dump restaurado num PostgreSQL local (nome `postgres` ou sidecar `qlmed_ci`).
`DATABASE_URL` do `dev` só aponta para `127.0.0.1`.

### Option B — continuar ADR-0007 (local usa o canônico da vps2)

Simples, mas qualquer `npm run dev` pode alterar dados de produção.

## Decision

1. Produção: um PostgreSQL canônico `postgres` na **vps2**, só via `DATABASE_URL`.
2. Host `dev`: restore isolado do dump em Postgres local. Proibido apontar
   `DATABASE_URL` para a vps2. Não criar `qlmed_dev`.
3. CI: `qlmed_ci` em `127.0.0.1:5433` (sidecar descartável).
4. n8n não faz parte do runtime nem do ambiente de desenvolvimento.
5. Checkout Git canônico: `~/qlmed/app`. Builder `qlmed-prod` e CI
   `qlmed-ci-linux-*` ficam neste `dev`. `~/qlmed/production` é staging do
   builder, não o runtime `/srv/qlmed` da vps2.
6. Host `server` não recebe mais papel QLMED.

## Consequences

### Positive

- Dev e prod não compartilham a instância PostgreSQL.
- O contrato de nome de banco (`postgres` / `qlmed_ci`) permanece.

### Negative

- O dump local pode ficar defasado; restaurar de novo é operação explícita.

## Verification

- `DATABASE_URL` no `dev` tem host `127.0.0.1`.
- Nenhum container `qlmed-app` / `qlmed-db` canônico neste host.
- `https://app.qlmed.com.br` e `127.0.0.1:13000` na vps2.
