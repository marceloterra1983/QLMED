# Research: SPEC-020

## Decisão

`cancelledAt` separado de `Invoice.status`.

## Alternativas

1. Reusar `status = rejected` — rejeitado: a UI de CT-e e a
   manifestação de NF-e já usam esse valor.
2. Enum `InvoiceStatus.cancelled` — mistura dois eixos e apaga
   confirmação/desconhecimento.
3. Tabela de eventos — correto a longo prazo; fora do pedido (tag na
   lista).

## Fontes

Manual do Contribuinte / DistDFe: cancelamento é `tpEvento` 110111;
aceitação do evento `cStat` 135/155; situação consolidada 101/151.
O `nfeProc` autorizado permanece com `cStat` 100 depois do cancelamento.

## DistDFe hoje

`sefaz-client` já classifica `resEvento` / `procEventoNFe` como
`tipo: 'evento'`. `syncViaSefaz` chama `parseInvoiceXml` e descarta
(`null`). O evento precisa de ramo próprio que atualiza a nota pela
chave.
