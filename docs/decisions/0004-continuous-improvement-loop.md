# ADR-0004 — Loop autônomo de melhoria contínua do app

- **Status:** accepted
- **Data:** 2026-07-26
- **Deciders:** QLMED ops

## Contexto

O app tem CI forte, Dependabot semanal (sem majors) e Spec Kit diário, mas não
havia um loop que **acumule métricas de qualidade/stack** e proponha trabalho
ao longo da vida do produto.

## Decisão

Adotar o **CI Loop** (`qlmed-app-ci-loop`):

1. Policy versionada em `.ci-loop/policy.json`
2. Medição automatizada (stack, outdated, audit, quality tracks)
3. Proposta via GitHub Issue + PR de patches seguros
4. Orquestração n8n → listener host (mesmo padrão Spec Kit / toolkit sync)
5. Aprovação humana obrigatória para merge e majors

## Consequências

- Scorecard vivo e notificável
- Patches deixam de depender só do Dependabot
- Dívida arquitetural vira track mensurável (não só documento)
- Risco controlado: sem auto-merge, sem majors automáticos
