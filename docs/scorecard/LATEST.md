# QLMED Scorecard — snapshot 2026-08-05

> Snapshot from 2026-08-05. The CI Loop listener is inactive (see
> [docs/continuous-improvement.md](../continuous-improvement.md)); regenerate
> before trusting these numbers. The 32-file and 79/89 figures below are
> historical snapshot values. This page is not live hygiene.

**Score de higiene (snapshot):** 8.8/10

## Stack
- Node `24.19.0` (pin 22)
- Next `15.5.22` · React `^19.2.8` · Prisma `7.9.1`
- Zod `^4.4.3` · NextAuth `4.24.15` · TS `^6.0.3`
- Spec Kit projeto `0.14.2` / CLI `0.14.4`
- n8n image `n8nio/n8n:2.29.10`

## Segurança (npm audit, omit=dev)
- critical/high: **0** · `{"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}`

## Quality tracks
- [PASS] `schema-dual` (high): SCHEMA-02: eliminar ensure*Table / DDL runtime — 0 matches (max 0)
- [FAIL] `money-float` (high): Precisão monetária: Float residual em schema Prisma — 80 matches (max 5)
- [PASS] `god-module-aggregation` (medium): Manter product-aggregation fatiado (index ≤600 LOC) — 27 LOC (max 600)
- [PASS] `test-coverage-lib` (medium): Ampliar suites Vitest (mín. 30 arquivos) — 32 files (min 30)
- [PASS] `zod-routes` (medium): Zod em ≥80% das rotas API — 79/89 = 89% (min 80%)

## Dead deps suspeitas

- (nenhuma)

## Patch candidatos (auto PR, max 12)

- (nenhum)

## Major watch (manual)

- `@types/node` 22.20.1 → 26.1.2
- `eslint` 9.39.4 → 10.8.0
- `eslint-config-next` 15.5.19 → 16.2.12
- `next` 15.5.22 → 16.2.12
- `tailwindcss` 3.4.19 → 4.3.3
- `typescript` 6.0.3 → 7.0.2

_Gerado por qlmed-app-ci-loop @ 2026-08-05T15:26:00Z_
