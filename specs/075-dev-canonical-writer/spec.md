---
id: SPEC-075
status: active
owner: QLMED
related_decisions:
  - ADR-0020
  - ADR-0007
affected_modules:
  - ops-preview
  - database-config
---

# Feature Specification: Next Omarchy no writer canônico

**Feature Branch**: `ops/dev-canonical-writer-tunnel`

**Created**: 2026-09-18

**Status**: Active

**Input**: O operador tem duas superfícies Next neste `dev` e precisa que
dados gravados aí sejam os de produção (vps2). O dump `:5434` não serve.

## Problem

Preview `:3002` e `~/qlmed/app/.env` apontavam para Postgres isolado
`127.0.0.1:5434`. Produção está na vps2 em `127.0.0.1:5432` (não publicado
no Tailscale). Cadastro em dev não aparecia em `app.qlmed.com.br`.

## Roles and ownership

- **Operador**: usa preview `:3002` (e opcionalmente `:3000`) contra o
  writer canônico. Workers de fundo no preview permanecem desligados.
- **Agente / CI**: replay de migration só em `qlmed_ci`. Não corre
  `migrate deploy` no writer (ROLE-001).
- **Deploy de produção**: único caminho de `migrate deploy` no canônico.

## Requirements

- **FR-001**: Túnel SSH persistente `127.0.0.1:5435` → vps2 `127.0.0.1:5432`.
- **FR-002**: `DATABASE_URL` do Next neste host usa porta `5435`, database
  `postgres`, host loopback.
- **FR-003**: Preview recusa dump `:5434` e host não-loopback.
- **FR-004**: `db:migrate:verify` / reconcile recusam alvo `postgres` neste
  host; exigem `qlmed_ci`.
- **FR-005**: Segredo da URL nunca é logado nem commitado.

## Acceptance Criteria

1. **AC-001** — Given o túnel ativo, when o preview sobe, then conecta em
   `:5435` / `postgres`.
2. **AC-002** — Given `DATABASE_URL` em `:5434`, when o starter do preview
   valida, then recusa.
3. **AC-003** — Given `DATABASE_URL` `postgres` (não `qlmed_ci`), when
   `assertDisposableCiReplay`, then falha sem ecoar a URL.
4. **AC-004** — Given `qlmed_ci` em `:5433`, when o mesmo assert, then aceita.

## Out of scope

- Publicar Postgres da vps2 no Tailscale ou em `0.0.0.0`.
- Ligar workers de fundo no preview.
- `migrate deploy` a partir do agente.

## Test strategy

- Vitest do preview-env e de `database-config`.
- Probe do túnel (SELECT 1) sem imprimir credencial.
