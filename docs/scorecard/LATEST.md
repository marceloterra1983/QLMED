# QLMED Scorecard — 2026-07-26

**Score de higiene:** 6.7/10

## Stack
- Node `22.22.1` (pin 22)
- Next `15.5.19` · React `^19.2.5` · Prisma `7.8.0`
- Zod `^4.3.6` · NextAuth `4.24.14` · TS `^6.0.2`
- Spec Kit projeto `0.12.11` / CLI `0.14.2`
- n8n image `n8nio/n8n:2.23.4@sha256:1872cce3548bf4dcfe5aceaf3d9293f4499635823fbdea0ee726bd222d2e44b8`

## Segurança (npm audit, omit=dev)
- critical/high: **12** · `{"info": 0, "low": 0, "moderate": 4, "high": 11, "critical": 1, "total": 16}`

## Quality tracks
- [FAIL] `schema-dual` (high): SCHEMA-02: eliminar ensure*Table / DDL runtime — 124 matches (max 0)
- [PASS] `money-float` (high): Precisão monetária: Float residual em schema Prisma — 0 matches (max 5)
- [FAIL] `god-module-aggregation` (medium): Quebrar product-aggregation.ts (≤600 LOC) — 2139 LOC (max 600)
- [FAIL] `test-coverage-lib` (medium): Ampliar suites Vitest (mín. 30 arquivos) — 0 files (min 30)
- [FAIL] `zod-routes` (medium): Zod em ≥80% das rotas API — 49/89 = 55% (min 80%)

## Dead deps suspeitas

- `effect`
- `fast-check`

## Patch candidatos (auto PR, max 12)

- `@eslint/eslintrc` 3.3.5 → 3.3.6 (latest 3.3.6)
- `@tanstack/react-virtual` 3.13.19 → 3.14.8 (latest 3.14.8)
- `@types/nodemailer` 8.0.0 → 8.0.1 (latest 8.0.1)
- `@types/react` 19.2.14 → 19.2.17 (latest 19.2.17)
- `@vitejs/plugin-react` 6.0.1 → 6.0.4 (latest 6.0.4)
- `autoprefixer` 10.4.24 → 10.5.4 (latest 10.5.4)
- `effect` 3.21.0 → 3.22.0 (latest 3.22.0)
- `fast-check` 4.6.0 → 4.9.0 (latest 4.9.0)
- `pg` 8.20.0 → 8.22.0 (latest 8.22.0)
- `recharts` 3.7.0 → 3.10.1 (latest 3.10.1)
- `vitest` 4.1.0 → 4.1.10 (latest 4.1.10)
- `zod` 4.3.6 → 4.4.3 (latest 4.4.3)

## Major watch (manual)

- `@types/node` 20.19.33 → 26.1.1
- `chokidar` 4.0.3 → 5.0.0
- `eslint` 9.39.4 → 10.8.0
- `eslint-config-next` 15.5.19 → 16.2.12
- `next` 15.5.19 → 16.2.12
- `puppeteer` 24.37.5 → 25.3.0
- `tailwindcss` 3.4.19 → 4.3.3
- `typescript` 6.0.2 → 7.0.2

_Gerado por qlmed-app-ci-loop @ 2026-07-26T03:15:09Z_
