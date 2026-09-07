# Design: árvore de estoque e recálculo do saldo (SPEC-058)

## Decisões

- Corte temporal único: `2021-01-01T00:00:00.000Z`. Backfill apaga movimentos fiscais e reconstrói entradas (NF-e recebidas + XML + `nfe_item_product_link`) e saídas emitidas a partir dessa data.
- Código canônico nas entradas: `matchedCodigo` do link S1–S7; fallback cadastro (`code`/`codigo`); último recurso o `cProd` do XML.
- Retorno de consignação recebido (1918/2918/5916/6916): OUT no cliente (emitente) + IN no CD.
- Controle lista o catálogo inteiro (saldo zero inclusive). Saída Material só `qty > 0`.
- UI reutiliza a hierarquia Linha > Grupo > Subgrupo do cadastro, com Recolher/Expandir e popup/expand (SPEC-039) para lotes + kardex.

## Fora de escopo

- Inventário físico / contagem cega.
- Novo motor FEFO além do já existente no ledger.
