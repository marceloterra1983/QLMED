# Data model: SPEC-021

Sem entidade nova. Reusa a NF-e emitida já listada.

## IssuedSummaryInvoice (entrada da regra)

| Campo | Uso |
|---|---|
| `totalValue` | Valor da nota (borda HTTP: number) |
| `cfop` | Primeiro CFOP persistido; fallback se `cfopTag` ausente |
| `cfopTag` | Etiqueta da lista (`GET /api/invoices`) |
| `cancelledAt` | Opcional. Se presente e preenchido, a nota não entra no cabeçalho |

## IssuedDailySalesHeader (saída)

| Campo | Regra |
|---|---|
| `saleCount` | Número de itens com etiqueta venda e sem cancelamento |
| `saleTotal` | Soma monetária desses itens (`sumMoney`) |

Validação: CFOP vazio/desconhecido ⇒ não-venda. Dia vazio ⇒ sem
cabeçalho numérico (mensagem atual de “nenhuma emitida”).
