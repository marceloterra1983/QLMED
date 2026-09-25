# Contract: /api/orcamentos (SPEC-085)

Todas as rotas exigem sessão. Mutações exigem editor+. `companyId` só do servidor.

## GET /api/orcamentos

Query: `q?`, `status?=draft|issued|cancelled`, `page?` (default 1), `limit?` (default 50, max 100).

200:

```json
{
  "quotes": [
    {
      "id": "…",
      "number": 8318,
      "numberLabel": "00008318",
      "issuedAt": "2026-09-15",
      "status": "issued",
      "customerName": "…",
      "customerCnpj": "05794356000168",
      "total": "3800.00",
      "itemCount": 1
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1, "pages": 1 }
}
```

## POST /api/orcamentos

Body: schema `quoteUpsertSchema` (cliente obrigatório, ≥1 item). 201: orçamento completo. 400 validação.

## GET /api/orcamentos/{id}

200 orçamento + items. 404 se outra empresa ou inexistente.

## PATCH /api/orcamentos/{id}

Mesmo body do POST. 409 se `cancelled`.

## POST /api/orcamentos/{id}/cancelar

Editor+. 200 status cancelled. Idempotente se já cancelado.

## POST /api/orcamentos/{id}/duplicar

Editor+. 201 novo draft com próximo número.

## GET /api/orcamentos/{id}/pdf

`Content-Type: application/pdf`. `?download=1` → attachment `orcamento-{numberLabel}.pdf`. 503 se Chromium ausente.

## GET /api/orcamentos/clientes?q=&limit=20

`{ "clientes": [{ "cnpj", "name", "shortName", "ie", "street", "number", "district", "city", "state", "zip" }] }`

`shortName` é o nome abreviado do cadastro, ou `null`. A ordem já vem com o abreviado na frente quando o termo casa nele. `name` continua a razão social gravada no orçamento.

## GET /api/orcamentos/produtos?q=&lineStatus=active&limit=20

`{ "produtos": [{ "id", "code", "description", "ncm", "unit", "rvs", "unitPrice" }] }`

`unitPrice` = último venda ou último compra, senão 0.
