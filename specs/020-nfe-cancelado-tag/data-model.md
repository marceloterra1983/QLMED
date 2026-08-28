# Data model: SPEC-020

## Invoice.cancelledAt

| Campo | Significado |
|---|---|
| cancelledAt | Instante do registro do cancelamento homologado. `null` = vigente |

Expand-only. Não altera `InvoiceStatus` (`received` / `confirmed` /
`rejected`), que continua sendo manifestação.

Uma vez preenchido, o sync MUST NOT limpar `cancelledAt`.

Índice: nenhum extra. A lista já filtra por `companyId` + `type` +
`direction`; a tag é campo da linha.

## Evidência aceita (não persistida à parte)

- `procEventoNFe`: `tpEvento = 110111` e `retEvento/infEvento/cStat` em
  `135` ou `155`. `cancelledAt` = `dhRegEvento` ou `dhEvento`.
- `resEvento`: `tpEvento = 110111`. `cancelledAt` = `dhEvento` se
  presente, senão o instante da aplicação.
- NSDocs `situacao` com `CANCEL` / `CANCELADA` / `CANCELAMENTO`, sem
  `DESACORDO` (esse texto é CT-e).
