---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: Remediação Pós-Revisão Arquitetural
status: executing
last_updated: "2026-08-03T00:00:00Z"
last_activity: 2026-08-03
progress:
  total_phases: 12
  completed_phases: 12
  total_plans: 39
  completed_plans: 39
  percent: 100
---

# State: QLMED Correcao e Hardening

## Project Reference

**Core value:** Garantir que o QLMED em producao seja seguro, performatico e manutenivel
**Current focus:** Phase 11 complete; canonical persistence boundary reconciled;
remaining schema work is FKs and money precision

## Current Position

Phase: 11 — Unificação de Schema
Plan: 11-01 baseline, 11-02 CnpjCache Prisma PoC and 11-03 expand/contract
docs complete; the plan files retain their historical execution wording
Status: SCHEMA-01/02/03 closed 2026-07-26; all satellite stores use Prisma Client
Last activity: 2026-08-03 — ADR-0007 and the active docs/specs now define one
protected persistent `postgres` database via `DATABASE_URL`, disposable
`qlmed_ci` for CI, and no `qlmed_dev`; no live migration or runtime operation
was executed by this reconciliation.

## Performance Metrics

| Metric | Value |
|--------|-------|
| Plans completed | 39 |
| Plans failed | 0 |
| Phases completed | 12/12 (milestone v2.0 core; satellite-store follow-ups out of phase scope) |
| Repair budget used | 0/2 per plan |

| Phase | Plan | Duration | Tasks | Files |
|-------|------|----------|-------|-------|
| 01 | 02 | 63s | 2 | 2 |
| Phase 01 P01 | 89 | 1 tasks | 1 files |
| Phase 01 P03 | 180s | 2 tasks | 6 files |
| Phase 02 P01 | 257 | 2 tasks | 2 files |
| Phase 02 P02 | 419 | 2 tasks | 5 files |
| Phase 03 P01 | 182s | 2 tasks | 1 files |
| Phase 04 P02 | 107s | 1 tasks | 1 files |
| Phase 04 P01 | 140 | 2 tasks | 2 files |
| Phase 04 P03 | 183 | 2 tasks | 2 files |
| Phase 04 P04 | 238 | 2 tasks | 4 files |
| Phase 04 P05 | 235 | 2 tasks | 2 files |
| Phase 05 P01 | 496 | 2 tasks | 16 files |
| Phase 05 P02 | 368 | 2 tasks | 7 files |
| Phase 05 P03 | 388 | 2 tasks | 6 files |
| Phase 06 P01 | 145 | 2 tasks | 5 files |
| Phase 06 P02 | 801 | 2 tasks | 17 files |
| Phase 06 P03 | 1038 | 2 tasks | 67 files |
| Phase 06 P04 | 371 | 2 tasks | 19 files |
| Phase 06 P05 | 715 | 2 tasks | 31 files |
| Phase 07 P01 | 266 | 2 tasks | 5 files |
| Phase 07 P02 | 1139 | 2 tasks | 6 files |
| Phase 07 P03 | 1295 | 2 tasks | 31 files |
| Phase 08 P02 | 644 | 2 tasks | 7 files |
| Phase 08 P03 | 879 | 2 tasks | 9 files |
| Phase 08 P04 | 1062 | 2 tasks | 15 files |
| Phase 08 P01 | 1096 | 2 tasks | 9 files |
| Phase 09 P01 | 238 | 2 tasks | 1 files |
| Phase 09 P02 | 298 | 1 tasks | 1 files |
| Phase 09 P03 | 488 | 2 tasks | 8 files |
| Phase 10 P01 | 326 | 1 tasks | 6 files |
| Phase 10 P02 | 338 | 1 tasks | 8 files |
| Phase 10 P03 | 648 | 2 tasks | 8 files |
| Phase 10 P04 | 460 | 2 tasks | 41 files |
| Phase 11 P01–P03 | — | SCHEMA-01..03 closed 2026-07-26 | — |
| Phase 12 P01–P03 | — | Complete 2026-07-12 | — |

## Accumulated Context

### Key Decisions

| Decision | Phase | Rationale |
|----------|-------|-----------|
| Security first ordering | Roadmap | PINs hardcoded e zero rate limiting sao exploraveis agora |
| Upgrades last | Roadmap | Maior risco de regressao, todo o codigo deve estar limpo antes |
| XML extraction before dedup | Roadmap | Extraction pode alterar parsing code que dedup precisa consolidar |
| Map-based rate limiter over npm | 01-02 | Edge Runtime restricts npm packages; plain Map with lazy cleanup is fully compatible |
| Rate limit before auth | 01-02 | Block brute-force before JWT validation to prevent wasted crypto operations |
| Remaining high vulns out of scope | 02-01 | next, glob, xlsx require major upgrades handled in UPG-01/DEP-04 |
| legacy-peer-deps for nodemailer v8 | 02-01 | next-auth optional peer on nodemailer ^7 not used for email provider |
| @@ignore stubs for schema visibility | 03-01 | Consistent with existing pattern (InvoiceTaxTotals, InvoiceItemTax, etc.) |
| pino with browser disabled | 06-01 | Next.js server-only usage, avoids browser-side pino bundling issues |
| Canonical persistent database | ADR-0007 | One protected `postgres` database through `DATABASE_URL`; CI uses disposable `qlmed_ci`; no `qlmed_dev` or URL aliases |

### Discovered TODOs

_(none yet)_

### Blockers

- Nenhum blocker ativo para SCHEMA-01..03 (fechados 2026-07-26).
- Follow-up: FKs/`@relation` e `Float`→`Decimal` (ver ADR-0006).

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260410-rvi | Fix mobile DANFE viewing in InvoiceDetailsModal | 2026-04-10 | f7c95c9 | [260410-rvi-fix-mobile-danfe-viewing-in-invoicedetai](./quick/260410-rvi-fix-mobile-danfe-viewing-in-invoicedetai/) |
| 260410-s81 | Implement option B: mobile DANFE via HTML fallback (reverts 260410-rvi placeholder) | 2026-04-10 | cb65357 | [260410-s81-implement-option-b-mobile-danfe-via-html](./quick/260410-s81-implement-option-b-mobile-danfe-via-html/) |
| 260410-swk | Option D: PDF.js standalone viewer for mobile DANFE (reverts s81, drops PDF.js v4.8.69 into public/pdfjs/) | 2026-04-10 | 17554d9 | [260410-swk-option-d-pdf-js-standalone-viewer-for-mo](./quick/260410-swk-option-d-pdf-js-standalone-viewer-for-mo/) |

### Gotchas

- O runtime persistente usa somente `DATABASE_URL` apontando para o banco
  canônico `postgres`. CI/replay usa exclusivamente o banco efêmero `qlmed_ci`;
  `qlmed_dev`, nomes arbitrários e aliases de URL são rejeitados. A conexão
  local exige credencial protegida e `QLMED_DISABLE_BACKGROUND_SERVICES=true`.
- node-forge update (Phase 2) precisa de teste cuidadoso com assinatura NF-e
- PINs sao padrao da empresa — manter funcionalidade, proteger implementacao
- Containers de produção usam os nomes estáveis do Compose (`qlmed-app`, `qlmed-db`, `qlmed-n8n` e serviços Evolution)

### Milestone v2.0 — Notas

- Escopo derivado de `docs/server/ARCH-REMEDIATION-PLAN.md` (revisão
  arquitetural de 2026-07-11), sem re-pesquisa — pesquisa já feita por 3
  agentes especializados na sessão de origem.
- Dependência cruzada de repo: a antiga separação `qlmed_dev` do workstream
  `server-hardening` é contexto histórico dos planos da Phase 11. O contrato
  atual está em `docs/decisions/0007-single-canonical-database.md` e não cria
  outro banco persistente. SCHEMA-01..03 fechados 2026-07-26.

## Session Continuity

### Last Session

- **Date:** 2026-07-26
- **What happened:** SCHEMA-01/02/03 closed (baseline, CnpjCache Prisma PoC,
  expand/contract policy); the single-database contract was reconciled in
  ADR-0007 and the active SDD/docs.
- **Where stopped:** Phase 11 and the remaining satellite-store migrations are
  complete; FKs and money precision remain. No `qlmed_dev` was provisioned.

### Next Session Should

1. Adicionar FKs/`@relation` onde ainda faltam, sob plano separado.
2. Planejar `Float`→`Decimal` com compatibilidade expand/contract.
3. Manter o replay do CI em `qlmed_ci` e os gates de configuração canônica
   verdes a cada mudança.

---
*Last updated: 2026-08-03 — contrato de persistência canônica reconciliado com
ADR-0007; referências a `qlmed_dev` permanecem apenas como histórico dos planos.*
