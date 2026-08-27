# Cleanup webhook_entity órfãos — qlmed-n8n

- Quando: 2026-07-23T10:57:24Z
- Ação: DELETE FROM webhook_entity WHERE workflowId IN ('b3IndicadoresMon1','b3RedundanciaMon1')
- Motivo: workflows B3 removidos; restavam paths mortos b3-indicadores / b3-redundancia
- Resultado: 2 linhas removidas; remanescente: autofix-approve (w6RQDdB54gfvF0Mu)
