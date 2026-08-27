# Implementation Plan: Caption curta do CT-e no WhatsApp

**Branch**: `feat/cte-whatsapp-caption` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

## Summary

Montar o caption WhatsApp de CT-e em TypeScript (nome curto, C.G., rota ➡️,
sem número, sem chave, sem caminhão) e anexá-lo no claim do outbox. O worker Python só concatena o
link. E-mail e NF-e continuam com `build_text` atual.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15, Python 3 worker existente

**Primary Dependencies**: nenhum pacote novo

**Storage**: sem schema novo; cidades extraídas de `Invoice.xmlContent`

**Testing**: Vitest (caption, nome curto, cidades) + unittest do worker

**Constraints**: não enviar XML ao worker; não logar chave/XML

**Scale/Scope**: um caption por entrega WhatsApp de CT-e

## Constitution Check

- Evidência automatizada do caption e do worker (I).
- Sem mudança de auth (II).
- Sem migration (III).
- Lógica em `src/lib`; rota de claim só serializa (IV).
- XML não vai ao worker; chave some só no WhatsApp de CT-e (V).
- SPEC-017, sem GSD (VI).

## Project Structure

```text
specs/017-cte-whatsapp-caption/
src/lib/cte-whatsapp-caption.ts
src/lib/__tests__/cte-whatsapp-caption.test.ts
src/lib/notification-outbox.ts
scripts/notification-outbox-worker.py
scripts/test_notification_outbox_worker.py
```

## Complexity Tracking

Nenhuma. Reusa claim + worker. Sem coluna nova.
