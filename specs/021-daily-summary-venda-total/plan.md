# Implementation Plan: Total do resumo diário só com venda

**Branch**: `feat/daily-summary-venda-total` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

## Summary

A regra canônica do cabeçalho passa a viver em `src/lib/daily-issued-summary.ts`:
contagem e soma só quando `getCfopTagByCode` / `cfopTag === 'Venda'`.
Não-venda continua com `(CONSIG.)` na linha (SPEC-018). O node n8n
`Montar Resumo` do workflow `dailysummaryissued01` aplica a mesma regra
no texto enviado; o JSON do workflow **não** está no git do produto.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15; JavaScript no n8n

**Primary Dependencies**: nenhum pacote novo; `sumMoney` em `src/lib/money.ts`

**Storage**: sem schema novo. Reusa `Invoice.cancelledAt` da SPEC-020
(já em `main`); item cancelado não entra no cabeçalho.

**Testing**: Vitest em `src/lib/__tests__/daily-issued-summary.test.ts`
(TDD: testes do cabeçalho falham antes da implementação)

**Target Platform**: resumo WhatsApp ~18h, America/Campo_Grande

**Project Type**: web application + workflow n8n

**Constraints**: não reclassificar por nome de cliente; não logar XML;
não usar float na soma canônica

**Scale/Scope**: um cabeçalho por dia; N linhas de emitidas

## Constitution Check

| Princípio | Situação |
|---|---|
| I. Evidência executável | Atende — testes do cabeçalho + regressão do sufixo. |
| II. Autorização no servidor | Atende — sem mudança de auth; lista continua autenticada. |
| III. Migrations donas do esquema | N/A — sem migration. |
| IV. Rotas adaptam, `src/lib` implementa | Atende — soma em `daily-issued-summary.ts`. |
| V. Segredos e XML contidos | Atende — sem XML no resumo. |
| VI. Uma fonte canônica | Atende — SPEC-021 supersede o cabeçalho da 018; ADR-0010 intacto. |

## Project Structure

```text
specs/021-daily-summary-venda-total/
src/lib/daily-issued-summary.ts
src/lib/__tests__/daily-issued-summary.test.ts
```

Texto WhatsApp: `~/ops/n8n/qlmed-workflows-snapshot/dailysummaryissued01.json`
(fora do git do produto). Promoção: `~/ops/scripts/n8n-promote.sh promote <arquivo.json> qlmed --execute-approved`.

## Complexity Tracking

Nenhuma. Reusa `isIssuedSaleOperation` e o node `Montar Resumo`.
