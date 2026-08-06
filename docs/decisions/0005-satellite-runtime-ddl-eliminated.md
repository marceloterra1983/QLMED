---
id: ADR-0005
status: superseded
date: 2026-07-30
supersedes: ADR-0002
related_specs:
  - SPEC-002
---

> **Superseded by [ADR-0006](0006-satellite-stores-prisma-client.md)** (2026-07-31):
> stores satélite já usam Prisma Client. Residual AS-IS: FKs/`@relation` e
> Float→Decimal (não mais migração de CRUD raw). Manter este registro como
> estágio intermediário pós-DDL.

# Runtime DDL das tabelas satélite eliminado; restam FKs e precisão monetária

## Context

[ADR-0002](0002-satellite-tables-runtime-ddl-legacy.md) decidiu consolidar as
tabelas satélite em Prisma (Option B), tratando `ensure*Table` / DDL em runtime
como legado. A Phase 11 (SCHEMA-01/02/03) removeu `ensure*Table` e `@@ignore`
de `src/` / `prisma/schema.prisma`, com PoC de Client tipado (ex.: `NcmCache`,
`ProductRegistry`, `CnpjCache`). O estado operacional de ADR-0002 (“Option A
como legado **atual**”) deixou de ser verdade.

## Decision drivers

- Documentar o progresso sem reescrever a história de ADR-0002.
- Manter a direção: Prisma/migrations como única fonte de verdade.
- Deixar explícito o residual de schema (FKs, Float→Decimal); stores tipados
  foram fechados em [ADR-0006](0006-satellite-stores-prisma-client.md).

## Considered options

### Option A — Só anotar ADR-0002 in-place

Risco: mistura decisão histórica com estado atual e confunde leitores.

### Option B — Novo ADR que supersede ADR-0002 (escolhida)

Preserva o registro histórico e declara o novo estado + residual.

## Decision

**Option B.** Runtime DDL (`ensure*Table` / `CREATE TABLE IF NOT EXISTS` em
`src/`) está eliminado. Nenhuma nova tabela/coluna pode ser criada em runtime.
Trabalho residual de schema (AS-IS via ADR-0006; stores tipados já migrados):

1. FKs Prisma / `pg_constraint` nas satélites onde ainda faltam `@relation`;
2. Float→Decimal onde valores fiscais ainda forem `Float` no schema.

## Consequences

### Positive

- Dupla fonte de verdade via DDL runtime acabou.
- Scorecard `schema-dual` pode exigir zero `ensure*Table` em `src/`.

### Negative

- Integridade referencial e precisão monetária ainda são follow-up (não “feito”).
- ADR-0002 permanece como história; o AS-IS de stores/residual está em ADR-0006.

## Verification

- `rg 'ensure\\w*Table|CREATE TABLE IF NOT EXISTS' src/` → 0.
- `npm run db:migrate:verify` / drift-check verdes no fluxo de deploy.
- Critérios de FK e Float→Decimal: acompanhar SPEC-002 / ADR-0006.
