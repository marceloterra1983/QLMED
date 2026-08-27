# Implementation Plan: Aviso no celular quando a nota é recebida

**Branch**: `feat/pwa-invoice-push` | **Date**: 2026-08-27 | **Spec**: [spec.md](./spec.md)

## Summary

Canal `push` no outbox de `invoice_received`. Inscrição Web Push por usuário.
Envio VAPID pelo app; o worker só despacha esse canal. PWA mostra o toque.

## Technical Context

**Language/Version**: TypeScript 5 / Next.js 15, Python 3 worker existente

**Primary Dependencies**: `web-push` 3.6.7 (já publicado no npm), Prisma 7

**Storage**: PostgreSQL — enum `NotificationChannel.push` + tabela
`PushSubscription`

**Testing**: Vitest (destinos, normalização, payload)

**Target Platform**: PWA (Chrome Android; Safari iOS 16.4+ instalado)

**Project Type**: web-service + PWA

**Constraints**: sem XML/chave no payload; VAPID fora do git; sem deploy
automático

**Scale/Scope**: dezenas de usuários, poucos aparelhos cada

## Constitution Check

- Evidência: testes de destinos e payload (I).
- Autorização: inscrição só com `requireSessionRole('viewer')`; envio interno
  com `notifications:dispatch` (II).
- Schema: migration Prisma versionada (III).
- Rotas finas, lógica em `src/lib` (IV).
- Sem log de XML/endpoint/chaves (V).
- Spec + ADR, sem GSD (VI).

## Project Structure

```text
specs/016-pwa-invoice-push/
src/lib/web-push.ts
src/lib/push-subscriptions.ts
src/app/api/users/me/push-subscription/route.ts
src/app/api/notifications/outbox/push/route.ts
public/sw.js
scripts/notification-outbox-worker.py
prisma/schema.prisma
prisma/migrations/20260827180000_add_web_push_subscriptions/
```

## Complexity Tracking

Nenhuma. Reusa outbox. Pacote `web-push` em vez de criptografia RFC 8291 à mão.
