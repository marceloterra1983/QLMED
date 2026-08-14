---
id: ADR-0006
status: accepted
date: 2026-07-31
supersedes: ADR-0005
related_specs:
  - SPEC-002
  - SPEC-004
---

# Stores satélite usam Prisma Client; restam FKs e precisão monetária

## Context

[ADR-0005](0005-satellite-runtime-ddl-eliminated.md) registrou o fim do DDL em
runtime, mas ainda listava stores satélite em SQL cru como trabalho residual.
Os PRs #52 (`765d510`) e #53 (`2a5637d`) migraram as stores restantes para
Prisma Client. Uma auditoria atual de `src/` encontra SQL cru somente para
health checks, teste de integração e advisory lock, não para CRUD das tabelas
satélite.

## Decision

Prisma Client é a interface canônica para CRUD das stores satélite. SQL cru
permanece permitido apenas quando a operação não tem representação adequada no
Client e possui escopo explícito, como advisory locks e probes `SELECT 1`.

O trabalho residual de schema é:

1. adicionar FKs/`@relation` onde ainda faltam;
2. converter campos monetários `Float` para `Decimal` com rollout
   expand/contract;
3. preservar migrações versionadas e checkpoints humanos para produção.

## Consequences

- O scorecard pode tratar retorno de CRUD satélite em SQL cru como regressão.
- ADR-0005 permanece como registro do estágio intermediário pós-DDL.
- Mudanças de FK e precisão continuam separadas da migração das stores.

## Verification

- `rg 'ensure\w*Table|CREATE TABLE IF NOT EXISTS' src/` retorna zero.
- `rg '\$queryRaw|\$executeRaw' src/` não aponta para CRUD satélite.
- Testes das stores e validações Prisma permanecem obrigatórios no CI.
