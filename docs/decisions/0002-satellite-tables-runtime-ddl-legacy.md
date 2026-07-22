---
id: ADR-0002
status: accepted
date: 2026-07-22
supersedes: null
related_specs: []
---

# Tabelas satélite com DDL em runtime são legado a consolidar em Prisma

## Context

Cerca de 8 tabelas satélite (`invoice_item_tax`, `invoice_tax_totals`,
`invoice_duplicata`, `stock_entry`, `nfe_entry_item`, `product_registry`,
`contact_fiscal`, `product_settings_catalog`, `ncm_cache`) são criadas/alteradas
em **runtime** por funções `ensure*Table` (`CREATE TABLE IF NOT EXISTS` /
`ALTER TABLE ADD COLUMN IF NOT EXISTS`) e acessadas por SQL cru
(`$queryRaw`/`$executeRaw`), ao mesmo tempo em que são declaradas no
`prisma/schema.prisma` com `@@map` e cobertas por uma migration baseline. O
painel de especialistas (2026-07-22) e o próprio `CLAUDE.md` ("Runtime DDL is
legacy and must not be introduced") identificaram isso como **dupla fonte de
verdade**: o schema real pode divergir silenciosamente do Prisma.

## Decision drivers

- Uma única fonte de verdade para o schema (o `CLAUDE.md` exige Prisma/migrations).
- Fim do drift silencioso entre DDL runtime e Prisma.
- Integridade referencial (FKs) e higiene de índices dependem de schema versionado.

## Considered options

### Option A — Manter DDL runtime indefinidamente

Zero esforço agora; mantém o drift, a via dupla de acesso e a ausência de FKs.

### Option B — Consolidar as satélites em Prisma/migrations (SCHEMA-02 / Phase 11)

Materializar o schema real em migration, remover os `ensure*Table`, migrar os
stores de SQL cru para o Client tipado, adicionar FKs e dedup de índices, com
política expand/contract.

## Decision

**Option B como direção; Option A reconhecida como estado legado atual.** O DDL
em runtime é legado explícito. Nenhuma nova tabela/coluna deve ser criada por
`ensure*Table`. A consolidação em Prisma é a fase **SCHEMA-02 / Phase 11** do
roadmap, tratada como migração de dado fiscal (backup + teste em `qlmed_dev`
reseedado + rollback).

## Consequences

### Positive

- Caminho claro para fonte única, FKs, índices sem duplicata e fim do drift.
- Rotas deixam de pagar round-trip DDL por request.

### Negative

- Até a SCHEMA-02, o drift e a ausência de FK permanecem; integridade fica só na
  aplicação (ver [ADR-0001]).
- Migração de tipos (ex.: valores fiscais `Float`→`Decimal`) exige cuidado com
  precisão em dado existente.

## Verification

- `scripts/gsd/audit-runtime-declarative.py` / drift-check verdes.
- Ausência de `ensure*Table` e de `$queryRaw`/`$executeRaw` para essas tabelas
  após a SCHEMA-02.
- FKs presentes em `pg_constraint` para as satélites.
