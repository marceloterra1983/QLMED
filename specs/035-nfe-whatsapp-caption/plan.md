# Implementation Plan: Caption curta da NF-e no WhatsApp

**Branch**: `feat/nfe-whatsapp-caption` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

## Summary

Montar o caption WhatsApp de NF-e em TypeScript (número, nome com prioridade
ao apelido do cadastro, valor sem rótulo, sem chave) e anexá-lo no claim do
outbox. O worker Python usa `whatsappCaption` também para NF-e. E-mail e
CT-e continuam como estão.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15, Python 3 worker existente

**Primary Dependencies**: nenhum pacote novo

**Storage**: sem schema novo; apelido via `ContactNickname` existente

**Testing**: Vitest (caption + shortName) + unittest do worker

**Constraints**: não enviar XML ao worker; não logar chave/XML

**Scale/Scope**: um caption por entrega WhatsApp de NF-e

## Constitution Check

- Evidência automatizada do caption e do worker (I).
- Sem mudança de auth (II).
- Sem migration (III).
- Lógica em `src/lib`; claim só enriquece (IV).
- XML não vai ao worker; chave some só no WhatsApp de NF-e (V).
- SPEC-035, sem GSD (VI).

## Project Structure

```text
specs/035-nfe-whatsapp-caption/
src/lib/cte-whatsapp-caption.ts
src/lib/__tests__/cte-whatsapp-caption.test.ts
src/lib/notification-outbox.ts
scripts/notification-outbox-worker.py
scripts/test_notification_outbox_worker.py
governance.yaml
```

## Complexity Tracking

Nenhuma. Reusa claim + worker + ContactNickname. Sem coluna nova.
