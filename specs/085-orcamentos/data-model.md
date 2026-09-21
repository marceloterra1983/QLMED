# Data model: Orçamentos (SPEC-085)

## QuoteStatus

`draft` | `issued` | `cancelled`

## Quote

| Campo | Tipo | Notas |
|---|---|---|
| id | cuid | |
| companyId | FK Company CASCADE | isolamento |
| number | Int | unique (companyId, number); impresso 8 dígitos |
| issuedAt | DateTime | data do documento (civil) |
| status | QuoteStatus | default draft |
| customerCnpj | String | só dígitos |
| customerName | String | snapshot |
| customerIe | String? | |
| customerCode | String? | SPICA se um dia existir; v1 null |
| customerStreet, Number, District, City, State, Zip | String? | snapshot |
| salesperson | String? | |
| patientName, doctorName, convenio, local | String? | bloco clínico |
| notes | String? | obs livre |
| freight | Decimal(14,2) | default 0 |
| subtotal | Decimal(14,2) | servidor |
| total | Decimal(14,2) | subtotal + freight |
| createdByUserId | String | |
| createdAt / updatedAt | DateTime | |

Índices: `(companyId, issuedAt desc)`, `(companyId, status)`, `(companyId, customerCnpj)`.

## QuoteItem

| Campo | Tipo | Notas |
|---|---|---|
| id | cuid | |
| quoteId | FK Quote CASCADE | |
| companyId | FK Company CASCADE | denormalizado para queries |
| lineNumber | Int | 1-based |
| productRegistryId | String? | SetNull se o produto sumir |
| code, description, rvs, ncm, unit | snapshot | rvs = ANVISA |
| quantity | Decimal(12,4) | > 0 |
| unitPrice | Decimal(14,2) | ≥ 0 |
| discount | Decimal(14,2) | ≥ 0, ≤ qty×price |
| lineTotal | Decimal(14,2) | qty×price − discount, half-up 2 |

Índice `(quoteId, lineNumber)` unique.

## Regras

- `lineTotal = round(qty × unitPrice) − discount` com half-up em cada parcela monetária.
- `subtotal = Σ lineTotal`; `total = subtotal + freight`.
- Número: `MAX(number)+1` na transação da empresa; primeiro = 1.
- Cancelado é terminal para PATCH; GET/PDF continuam.

## Relação Company

`Company.quotes Quote[]` e `Company.quoteItems QuoteItem[]`.
