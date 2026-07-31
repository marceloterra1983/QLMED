# Melhoria contínua autônoma — QLMED app

Sistema que **mede → classifica → propõe** melhorias do app ao longo da vida do
produto. Humanos aprovam merge/deploy; o loop nunca altera `main` sozinho.

## Pilares

| Pilar | O quê |
|-------|--------|
| **Radar de stack** | Node/Next/React/Prisma/Zod/n8n/Spec Kit — pins vs latest |
| **Deps** | Dependabot (seg) + CI Loop (propose patches seguros) |
| **Quality tracks** | Metas permanentes (SCHEMA-02, Decimal/Float, god-files, testes, Zod) |
| **Segurança** | `npm audit` no CI + no scorecard diário/semanal |
| **Spec Kit** | Fluxo separado `speckitDailyUpdate01` (já ativo) |

## Componentes

| Peça | Path |
|------|------|
| Policy | `.ci-loop/policy.json` |
| Script | `~/ops/qlmed/ops/scripts/qlmed-app-ci-loop.sh` |
| Listener | `:18645` · `qlmed-ci-loop-listener.service` |
| Workflow n8n | `n8n/workflows/qlmedCiLoop01.json` |
| Estado local | `~/.local/state/qlmed-ci-loop/` |
| ADR | `docs/decisions/0004-continuous-improvement-loop.md` |

## Ciclo (n8n)

1. **Segunda 07:30** (Campo Grande): `POST /propose` — atualiza issue scorecard + abre PR de patches seguros se houver.
2. WhatsApp só se `notify=true` (falhas de track, vuln high, major watch, PR criado).

Manual:

```bash
~/ops/qlmed/ops/scripts/qlmed-app-ci-loop.sh --mode audit --json
curl -sS -H "X-Ci-Loop-Token: $(cat ~/ops/qlmed/ops/secrets/ci-loop.token)" \
  -X POST http://127.0.0.1:18645/audit
```

## O que o loop NÃO faz

- Merge automático
- Major de Next / Prisma / React / Tailwind 4 / ESLint 10 / TS 7
- `--force` de Spec Kit em `main` (ver `docs/spec-kit.md`)
- Refactors fiscais sem PR humano

## Evolução da policy

Edite `.ci-loop/policy.json` para:

- novos `qualityTracks` (checks `rg_count`, `file_lines`, `glob_count`, `zod_route_ratio`)
- `deadDepsSuspect`
- `autoPatch.exclude` / `maxPackagesPerPr`
- `stackPins`

Cada iteração do produto pode adicionar tracks (ex.: “zero Float em tax”, “rota details ≤150 LOC”).

## Entregue em `chore/quality-hardening` (2026-07-26)

- `withAuth`, `money.roundMoney`, `sefazRejectUnauthorized` (SSL default on)
- Roles: `cnpj-monitor` POST, export-xml, bulk-download → editor
- access-log auth→401/403 corretos; OneDrive sem leak de `error.message`
- Removidos dead deps `effect` / `fast-check`
- `product-aggregation` fatiado em módulos (barrel preservado)
- Testes: money, ssl-verify, with-auth, mutation-roles, parse-invoice-tax

Ainda manuais / fases seguintes: SCHEMA-02 (FKs / acesso tipado residual — `ensure*Table` já removido de `src/`), Float→Decimal no Prisma, Next 16, Tailwind 4.
