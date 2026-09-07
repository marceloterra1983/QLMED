# Design: Saída Material (SPEC-057)

**Date**: 2026-09-07  
**Status**: locked decisions

## Decisions

1. **Nav Estoque**: Entrada NF-e → Controle → Saída Material (`/estoque/saida-material`).
2. **Abas**: Consignado | Saída Avulsa | Venda Direta | Registro Material Usado.
3. **Fonte de estoque**: CD (qty>0) nas três primeiras abas; CUSTOMER+CNPJ em Material Usado.
4. **Catálogo**: enrich ProductRegistry (`productType`/`productSubtype`/`manufacturer`/`description`); agrupar como Produtos.
5. **Cliente**: obrigatório em Consignado, Venda Direta, Material Usado; opcional em Avulsa.
6. **Destino pós-carrinho**: modal com **Emitir NF-e** ou **Check List de Saída** (não `window.confirm`).
7. **CFOP default**: 5917 consignado; 5102 venda; 5114 material usado; avulsa sem NF (checklist / opcional ledger `SAIDA_AVULSA`).
8. **Checklist**: append-only `StockExitChecklist`; não baixa estoque salvo Avulsa com movimento.
9. **Lotes**: operador escolhe; FEFO só ordena.
10. **APIs dedicadas** sob `/api/estoque/saida-material/` para não quebrar Controle.

## Surfaces

- UI: `src/app/(painel)/estoque/saida-material/`
- Lib: `src/lib/saida-material.ts` + `stock-ledger` kind `SAIDA_AVULSA`
- Prisma: `StockExitChecklist` + migration pin
