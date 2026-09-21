# Data model: Arquivo de orçamentos (SPEC-086)

## QuoteArchive

| Campo | Tipo | Notas |
|---|---|---|
| id | cuid | |
| companyId | FK Company CASCADE | isolamento |
| sha256 | String | unique (companyId, sha256) |
| number | Int? | número SPICA se o PDF tiver `No.` |
| numberLabel | String? | 8 dígitos |
| issuedAt | Date? | |
| layout | `h020` \| `simples` | |
| sourceKind | `email` \| `arquivo` | |
| sourceMailbox | String? | só `@qlmed.com.br` |
| sourcePath | String | absoluto sob `0 - ORÇAMENTOS` |
| sourceSubject | String? | assunto Graph |
| customerCnpj / customerName | snapshot | cnpj pode ser vazio |
| salesperson, patientName, doctorName, convenio, local, notes | String? | |
| freight, subtotal, total | Decimal(14,2) | lidos do PDF |
| parseWarnings | Json | |

## QuoteArchiveItem

Linha snapshot (code, description, rvs, ncm, unit, quantity, unitPrice, discount, lineTotal). Sem FK de produto.

## Relação

`Company.quoteArchives` / `quoteArchiveItems`. Não mistura unique de `Quote.number`.
