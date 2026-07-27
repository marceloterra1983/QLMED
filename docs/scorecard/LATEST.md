# QLMED Scorecard — 2026-07-27

**Score de higiene:** 8.1/10

## Stack
- Node `22.22.1` (pin 22)
- Next `15.5.21` · React `^19.2.8` · Prisma `7.8.0`
- Zod `^4.4.3` · NextAuth `4.24.15` · TS `^6.0.2`
- Spec Kit projeto `0.12.11` / CLI `0.14.2`
- n8n image `n8nio/n8n:2.29.10@sha256:9cb60554716a0ab11a966e79ed65171e1bbf00b6d262ba12aa119bba22eb6000`

## Segurança (npm audit, omit=dev)
- critical/high: **0** · `{"info": 0, "low": 0, "moderate": 0, "high": 0, "critical": 0, "total": 0}`

## Quality tracks
- [FAIL] `schema-dual` (high): SCHEMA-02: eliminar ensure*Table / DDL runtime — 73 matches (max 0)
- [PASS] `money-float` (high): Precisão monetária: Float residual em schema Prisma — 0 matches (max 5)
- [PASS] `god-module-aggregation` (medium): Quebrar product-aggregation.ts (≤600 LOC) — 1 LOC (max 600)
- [FAIL] `test-coverage-lib` (medium): Ampliar suites Vitest (mín. 30 arquivos) — 0 files (min 30)
- [FAIL] `zod-routes` (medium): Zod em ≥80% das rotas API — 50/89 = 56% (min 80%)

## Dead deps suspeitas

- (nenhuma)

## Patch candidatos (auto PR, max 12)

- `@tanstack/react-virtual` 3.14.7 → 3.14.8 (latest 3.14.8)
- `@vitejs/plugin-react` 6.0.3 → 6.0.4 (latest 6.0.4)
- `recharts` 3.10.0 → 3.10.1 (latest 3.10.1)

## Major watch (manual)

- `@types/node` 22.20.1 → 26.1.1
- `eslint` 9.39.4 → 10.8.0
- `eslint-config-next` 15.5.19 → 16.2.12
- `next` 15.5.21 → 16.2.12
- `puppeteer` 24.37.5 → 25.3.0
- `tailwindcss` 3.4.19 → 4.3.3
- `typescript` 6.0.2 → 7.0.2

_Gerado por qlmed-app-ci-loop @ 2026-07-27T11:30:00Z_
