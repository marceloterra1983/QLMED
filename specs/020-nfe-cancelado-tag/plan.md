# Implementation Plan: Tag de NF-e cancelada nas emitidas

**Branch**: `feat/nfe-cancelado-tag` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

## Summary

Campo `Invoice.cancelledAt` (ortogonal a `status` de manifestação).
Detector em `src/lib/nfe-cancellation.ts` lê evento `110111` aceito
(`cStat` 135/155), resumo `resEvento` e `situacao` NSDocs. Sync SEFAZ
passa a aplicar o evento na nota existente sem sobrescrever o XML.
`GET /api/invoices` devolve `cancelledAt`. A página `/fiscal/issued`
mostra a tag **Cancelado**.

## Technical Context

**Language/Version**: TypeScript / Next.js 15

**Primary Dependencies**: nenhum pacote novo

**Storage**: Prisma — coluna anulável `cancelledAt` em `Invoice`

**Testing**: Vitest do detector e da regra da tag

**Constraints**: não reusar `rejected`; não logar XML; não criar nota
a partir de evento; expand-only

**Scale/Scope**: lista de emitidas já carregada (até 2000 itens)

## Constitution Check

- Evidência automatizada da detecção e da exposição (I).
- Sem papel novo; lista continua autenticada e isolada por empresa (II).
- Migration Prisma expand-only + janela de produção (III).
- Detector em `src/lib`; rotas só aplicam (IV).
- Sem XML no log (V).
- SPEC-020, sem GSD (VI).

## Project Structure

```text
specs/020-nfe-cancelado-tag/
src/lib/nfe-cancellation.ts
src/lib/__tests__/nfe-cancellation.test.ts
src/lib/sync-strategies/sefaz.ts
src/lib/sync-strategies/nsdocs.ts
src/app/api/nsdocs/import-period/route.ts
src/app/api/invoices/route.ts
src/types/index.ts
src/app/(painel)/fiscal/issued/page-client.tsx
prisma/schema.prisma
prisma/migrations/20260828210000_add_invoice_cancelled_at/
scripts/verify-production-migration-window.cjs
scripts/test-production-migration-window.cjs
```

## Complexity Tracking

Nenhuma. Um campo anulável e um detector compartilhado pelos syncs.
