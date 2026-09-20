---
id: SPEC-084
status: approved
owner: QLMED
affected_modules:
  - prisma-bootstrap
  - ci
related:
  - SPEC-083
---

# Feature Specification: Não subir rotinas de fundo no `next build`

**Feature Branch**: `feat/084-ci-build-no-bootstrap`

**Created**: 2026-09-20

**Status**: Approved

## Problem

O job `app` do CI define `DATABASE_URL` (sidecar `qlmed-ci-db`). Durante
`next build` → *Collecting page data*, o Next carrega rotas que importam
`prisma.ts`. Esse módulo via `DATABASE_URL` e dispara `bootstrap.ts`
(auto-sync, XML, mail, documentos). No runner de 3 GB o kernel mata o
processo: **exit 137**. O compile webpack já tinha passado.

## Roles and ownership

Inalterado. Produção em runtime (`node server.js`) continua a subir as
rotinas — `NEXT_PHASE` só existe no `next build`.

## Acceptance criteria

1. **AC-084-001** — `src/lib/prisma.ts` não importa `bootstrap` quando
   `NEXT_PHASE === 'phase-production-build'`.
2. **AC-084-002** — o job `app` de `.github/workflows/ci.yml` define
   `QLMED_DISABLE_BACKGROUND_SERVICES: 'true'` (mesmo contrato do preview).

## Out of scope

Aumentar RAM dos runners. Dependabot. DROP Float.
