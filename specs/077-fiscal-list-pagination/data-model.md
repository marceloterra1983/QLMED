# Data model: SPEC-077

Sem alteração de Prisma. Entidades de listagem já existentes:

## Invoice (leitura)

Filtro por `companyId` (auth), `type`, `direction`, `status`, período, busca. Paginação `skip/take`. Total via `count` condicional.

## Duplicata (financeiro)

`handleContasGet` já fatia `filtered` com `page`/`limit` (teto de schema 2000). A UI passa a honrar `limit` 50.

## Pagination DTO (invariante)

```
{ page: number, limit: number, total: number | null, pages: number | null }
```

`total`/`pages` nulos somente quando `includeTotal=false`.
