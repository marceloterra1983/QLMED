# Melhoria contínua autônoma — QLMED app

> **Estado verificado em 2026-08-03 — DIFERIDO:** o listener QLMED de CI Loop
> (`:18645`, `qlmed-ci-loop-listener.service`) não está instalado nem ativo no
> host. O workflow `qlmedCiLoop01` permanece apenas como arquivo versionado e
> inativo; não trate este documento como autorização para ativá-lo.

Sistema que **mede → classifica → propõe** melhorias do app ao longo da vida do
produto. Humanos aprovam merge/deploy; o loop nunca altera `main` sozinho.

## Pilares

| Pilar | O quê |
|-------|--------|
| **Radar de stack** | Node/Next/React/Prisma/Zod/n8n/Spec Kit — pins vs latest |
| **Deps** | Dependabot (seg) + CI Loop (propose patches seguros) |
| **Quality tracks** | Metas permanentes (SCHEMA-02, Decimal/Float, god-files, testes, Zod) |
| **Segurança** | `npm audit` no CI + no scorecard diário/semanal |
| **Spec Kit** | Ativo: `SpecKitAutoUpd01` (n8n Shared); `speckitDailyUpdate01` é cópia histórica/inativa |

## Componentes

| Peça | Path |
|------|------|
| Policy | `.ci-loop/policy.json` |
| Script | `~/ops/qlmed/ops/scripts/qlmed-app-ci-loop.sh` (execução manual, com `QLMED_APP_DEV=~/qlmed/app`) |
| Listener | **não instalado/ativo** (`:18645` e `qlmed-ci-loop-listener.service` são planejados) |
| Workflow n8n | `n8n/workflows/qlmedCiLoop01.json` (fonte versionada, inativo) |
| Estado local | `~/.local/state/qlmed-ci-loop/` |
| ADR | `docs/decisions/0004-continuous-improvement-loop.md` |

## Ciclo planejado (n8n; atualmente desativado)

1. **Segunda 07:30** (Campo Grande): `POST /propose` — atualiza issue scorecard + abre PR de patches seguros se houver.
2. WhatsApp só se `notify=true` (falhas de track, vuln high, major watch, PR criado).

Execução manual do script (sem listener):

```bash
QLMED_APP_DEV=~/qlmed/app \
  ~/ops/qlmed/ops/scripts/qlmed-app-ci-loop.sh --mode audit --json
```

Não há endpoint local `:18645` para chamar até que o listener seja
reimplantado e revalidado.

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

- Guards canônicos `requireAuth`/`requireRole`/`requireAdmin` (em `src/lib/auth.ts`; checados por `api-route-guards`), `money.roundMoney`, `sefazRejectUnauthorized` (SSL default on)
- Roles: `cnpj-monitor` POST, export-xml, bulk-download → editor
- access-log auth→401/403 corretos; OneDrive sem leak de `error.message`
- Removidos dead deps `effect` / `fast-check`
- `product-aggregation` fatiado em módulos (barrel preservado)
- Testes: money, ssl-verify, api-route-guards, mutation-roles, parse-invoice-tax

Ainda manuais / fases seguintes: FKs, Float→Decimal no Prisma, Next 16 e Tailwind 4.
