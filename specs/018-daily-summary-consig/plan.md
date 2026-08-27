# Implementation Plan: Marca de consignação no resumo do dia

**Branch**: `feat/daily-summary-consig` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

## Summary

A classificação venda / não-venda reusa `getCfopTagByCode`. A lista
`GET /api/invoices` passa a devolver `cfopTag`. O node n8n `Montar Resumo`
do workflow `dailysummaryissued01` acrescenta ` (CONSIG.)` depois do valor
quando `cfopTag !== 'Venda'`.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15; JavaScript no n8n

**Primary Dependencies**: nenhum pacote novo

**Storage**: sem schema novo; usa `Invoice.cfop`

**Testing**: Vitest da regra de sufixo (casos do dia 2026-08-27)

**Constraints**: não reclassificar por nome de cliente; não logar XML

**Scale/Scope**: uma linha por NF-e emitida no resumo das 18h

## Constitution Check

- Evidência automatizada do sufixo (I).
- Sem mudança de auth; a lista continua exigindo sessão (II).
- Sem migration (III).
- Regra em `src/lib`; a rota só anexa `cfopTag` (IV).
- Sem XML no resumo (V).
- SPEC-018, sem GSD (VI).

## Project Structure

```text
specs/018-daily-summary-consig/
src/lib/daily-issued-summary.ts
src/lib/__tests__/daily-issued-summary.test.ts
src/app/api/invoices/route.ts
src/types/index.ts
```

O texto WhatsApp continua no workflow n8n
`~/ops/n8n/qlmed-workflows-snapshot/dailysummaryissued01.json` (não é git do
produto). Promoção: `n8n-promote.sh` target `qlmed`.

## Complexity Tracking

Nenhuma. Reusa o mapa de CFOP e o node `Montar Resumo`.
