# Contract: list pagination

## GET /api/invoices

Query adicional:

- `includeTotal`: `1`/`true` (default) ou `0`/`false`.

Resposta `pagination`:

- com count: `{ page, limit, total, pages }`
- sem count: `{ page, limit, total: null, pages: null }`

Auth e isolamento inalterados.

## GET /api/financeiro/contas-pagar|receber

Sem mudança de contrato. `limit` default 50, max 2000. A UI envia 50.

## UI

`limit` das tabelas alvo ∈ [50, 100]. Prefetch do menu desligado.
