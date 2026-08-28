# Implementation Plan: Situação de cancelamento no sync NSDocs e no XML local

**Branch**: `feat/nfe-cancel-nsdocs-campos` | **Date**: 2026-08-28 | **Spec**: [spec.md](./spec.md)

## Summary

O cliente NSDocs passa a pedir `campos` com `situacao` e
`chave_acesso` em `/documentos`. A importação de XML local, quando o
arquivo não é uma nota parseável, aplica o detector da SPEC-020
(`applyNfeCancellation`) em vez de só agendar retry.

## Technical Context

**Language/Version**: TypeScript / Next.js 15

**Primary Dependencies**: nenhum pacote novo

**Storage**: reusa `Invoice.cancelledAt`

**Testing**: Vitest do cliente NSDocs (query `campos`) e do evento local

**Constraints**: não inventar endpoint; não sobrescrever XML; não
consultar SEFAZ

**Scale/Scope**: listagem já paginada; um arquivo local por vez

## Constitution Check

- Evidência automatizada da listagem e do evento local (I).
- Sem papel novo (II).
- Sem migration (III).
- Comportamento em `src/lib` (IV).
- Sem XML no log (V).
- SPEC-022, sem GSD (VI).

## Project Structure

```text
specs/022-nfe-cancel-nsdocs-campos/
src/lib/nsdocs-client.ts
src/lib/__tests__/nsdocs-client.test.ts
src/lib/local-xml-sync/apply-event-xml.ts
src/lib/local-xml-sync/file-import.ts
src/lib/__tests__/local-xml-event-cancel.test.ts
src/lib/__tests__/nfe-cancellation.test.ts
```

## Complexity Tracking

Nenhuma. Reusa o detector da SPEC-020; só passa a pedir os campos que
a API já devolve e a não descartar evento local.
