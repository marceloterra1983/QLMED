# Contrato: cabeçalho do resumo diário enviado

Mensagem WhatsApp do workflow `dailysummaryissued01`, node `Montar Resumo`.

## Cabeçalho (dia com emitidas)

```
📊 Resumo do Dia — DD/MM/AAAA

*Notas de venda:* <saleCount>
*Valor de vendas:* R$ <saleTotal>
━━━━━━━━━━━━━━━━━━
```

`<saleCount>` e `<saleTotal>` incluem só itens com etiqueta fiscal
**Venda**. Não-venda aparece nas linhas seguintes com ` (CONSIG.)` e
não altera esses dois números.

## Dia sem emitidas

Inalterado: “Nenhuma NF-e emitida hoje.” sem inventar total.

## Lista

`GET /api/invoices` já devolve `cfopTag` (SPEC-018). Sem campo novo
obrigatório nesta spec.
