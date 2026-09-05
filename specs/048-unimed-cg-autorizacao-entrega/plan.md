# Plano de implementação — SPEC-048

## Abordagem

Espelhar o pipeline SPEC-045 com store/parse/API/UI dedicados a entrega, sem misturar linhas de faturamento.

## Fases

1. Spec Kit + Prisma expand-only + pin da migration window
2. constants/parse/delivery-store/whatsapp + ingest dual-path
3. APIs list/detail/arquivo + sync único
4. UI com dois `Section` `defaultOpen={false}`
5. Testes parse/ingest/CLIQUE AQUI + tsc + migration window

## Riscos

- Filtro de assunto de faturamento engolir entrega → ramo explícito no loop
- Colisão de `internetMessageId` entre stores → tabelas de origem separadas
- Nome de PDF → prefixo `UNIMED-CG-ENTREGA`
