---
id: ADR-0005
status: accepted
date: 2026-07-30
supersedes: ADR-0002
related_specs:
  - SPEC-002
---

# Runtime DDL das tabelas satélite eliminado; restam FKs e stores tipados

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
- Deixar explícito o que ainda falta (FKs, stores residualmente crus, Float→Decimal).

## Considered options

### Option A — Só anotar ADR-0002 in-place

Risco: mistura decisão histórica com estado atual e confunde leitores.

### Option B — Novo ADR que supersede ADR-0002 (escolhida)

Preserva o registro histórico e declara o novo estado + residual.

## Decision

**Option B.** Runtime DDL (`ensure*Table` / `CREATE TABLE IF NOT EXISTS` em
`src/`) está eliminado. Nenhuma nova tabela/coluna pode ser criada em runtime.
Trabalho residual (fora do escopo de “DDL eliminado”):

1. FKs Prisma / `pg_constraint` nas satélites onde ainda faltam `@relation`;
2. Migrar stores que ainda usem raw SQL desnecessário para Client tipado;
3. Float→Decimal onde valores fiscais ainda forem `Float` no schema.

## Consequences

### Positive

- Dupla fonte de verdade via DDL runtime acabou.
- Scorecard `schema-dual` pode exigir zero `ensure*Table` em `src/`.

### Negative

- Integridade referencial e tipagem completa ainda são follow-up (não “feito”).
- ADR-0002 permanece como história; leitores devem seguir este ADR para o AS-IS.

## Verification

- `rg 'ensure\\w*Table|CREATE TABLE IF NOT EXISTS' src/` → 0.
- `npm run db:migrate:verify` / drift-check verdes no fluxo de deploy.
- Critérios de FK e stores tipados: acompanhar SPEC-002 / Phase 11 follow-ups.
