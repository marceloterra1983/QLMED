---
id: SPEC-046
status: approved
owner: QLMED
related_decisions: [ADR-0010]
affected_modules:
  - daily-issued-summary
  - whatsapp-evolution
  - system-routines
  - ops-daily-summary-catchup
  - navigation
supersedes:
  - SPEC-011
related_specs:
  - SPEC-018
  - SPEC-021
  - SPEC-044
---

# Feature Specification: Resumo diário nativo e aposentadoria do n8n QLMED

**Feature Branch**: `feat/retire-n8n-daily-summary`

**Created**: 2026-09-05

**Status**: Approved

**Input**: Migrar o workflow n8n `dailysummaryissued01` para o app; aposentar
`qlmedGlobalErr01` (sem port); desligar a stack `qlmed-n8n` e a superfície
Automações / Integração n8n.

## Problem

O Resumo Diário de NF-e emitidas (18h `America/Campo_Grande`, WhatsApp) vivia
no n8n, com catch-up no host consultando executions do n8n. Com apenas dois
workflows activos e o domínio fiscal já no portal, o n8n QLMED é custo e
superfície sem valor. O alerta global só reage a falhas de workflows n8n e
desaparece com a stack.

## Roles and ownership

- **Operador no grupo WhatsApp**: lê o resumo; não autentica no app.
- **Sistema (job nativo)**: monta e envia a mensagem; isolamento por
  `getSingleCompany()`; envio via Evolution.
- **Catch-up (systemd)**: após 18h CG, dispara o endpoint do app se o dia
  ainda não foi enviado — sem API n8n.

## User scenarios

### US1 — Resumo às 18h Campo Grande (P1)

Given emitidas do dia local CG, when chega a hora 18, then o app envia o
resumo ao grupo WhatsApp configurado (ADR-0010), com cabeçalho só de vendas
(SPEC-021) e linhas com `(CONSIG.)` nas não-vendas (SPEC-018).

### US2 — Catch-up sem n8n (P1)

Given o schedule 18h foi perdido, when o timer catch-up corre após 18h CG e
o dia ainda não foi marcado enviado, then POST no app dispara o job; se já
enviado, skip.

### US3 — Dry-run / kill switch (P2)

Given `DAILY_SUMMARY_DRY_RUN=1` ou `DAILY_SUMMARY_NATIVE=0`, when o tick
corre, then não envia WhatsApp (dry-run monta mensagem; native=0 não corre).

### US4 — Aposentadoria n8n (P1)

Given a migração está activa, when o operador abre o painel, then não há
entrada Automações nem formulário Integração n8n; Rotinas lista o resumo
nativo e não lista n8n-stuck-watchdog. Compose de deploy não sobe
`qlmed-n8n` / `n8n-db`.

## Acceptance criteria

1. **AC-001** — Job nativo em 18h `America/Campo_Grande` (bootstrap tick).
2. **AC-002** — Cabeçalho só vendas; linhas não-venda com `(CONSIG.)`.
3. **AC-003** — Destino = `getConfiguredWhatsAppGroup()` (ou
   `DAILY_SUMMARY_WHATSAPP_GROUP_JID` se `@g.us` válido).
4. **AC-004** — Idempotência por data CG **no Postgres** (`daily_issued_summary_send`)
   + marcador local; advisory lock fail-closed. Preview/dev **não enviam**
   (só `NEXTAUTH_URL=https://app.qlmed.com.br`, ou `DAILY_SUMMARY_ALLOW_SEND=1`).
5. **AC-005** — Catch-up chama `/api/system/daily-issued-summary`, não n8n.
6. **AC-006** — `qlmedGlobalErr01` não é portado.
7. **AC-007** — SPEC-011 retired; Automações/UI n8n removidas da navegação.
8. **AC-008** — Compose sem serviços n8n QLMED.
9. **AC-009** — Webhook inbound `/api/webhooks/n8n` permanece (fase posterior).

## Functional requirements

- **FR-001**: `buildDailyIssuedSummaryMessages` port fiel do node Code
  (partição 3500, noAutoLink, apelidos, abreviação).
- **FR-002**: `sendWhatsAppText` na Evolution com a mesma política de egresso
  de `sendWhatsAppDocument`.
- **FR-003**: `runDailyIssuedSummary` orquestra query + nicknames + envio.
- **FR-004**: `startDailyIssuedSummary` no bootstrap.
- **FR-005**: Catálogo Rotinas actualizado; `n8n-stuck-watchdog` removido.
- **FR-006**: Claim atómico Postgres por `dateISO`; preview com
  `DAILY_SUMMARY_NATIVE=0` + `QLMED_DISABLE_BACKGROUND_SERVICES=true`.
- **FR-007**: Gate prod-only via `isDailySummarySenderAllowed()`.

## Out of scope

- Apagar volumes Postgres n8n no host.
- Remover modelos Prisma `N8n*` (contract posterior).
- Remover webhook inbound n8n.
- Substituto genérico do GlobalErr para todos os jobs.
