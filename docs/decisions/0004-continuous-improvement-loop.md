---
id: ADR-0004
status: accepted
date: 2026-07-26
supersedes: null
related_specs: []
---

# Loop autônomo de melhoria contínua do app

## Context

O app tem CI forte, Dependabot semanal (sem majors) e Spec Kit diário, mas não
havia um loop que **acumule métricas de qualidade/stack** e proponha trabalho
ao longo da vida do produto.

## Decision drivers

- Manter scorecard vivo e notificável sem depender só de revisão humana ad hoc.
- Aplicar patches seguros de forma repetível, com aprovação humana no merge.
- Tornar dívida arquitetural mensurável (tracks), não só documentação estática.
- Reutilizar o padrão operacional Spec Kit / toolkit sync (n8n → listener host).

## Considered options

### Option A — Só Dependabot + CI

Benefício: zero infra nova. Custo: sem scorecard acumulado nem tracks de dívida.

### Option B — CI Loop com policy versionada (escolhida)

Benefício: medição + proposta automática + gates humanos. Custo: listener + workflow n8n.

## Decision

Adotar o **CI Loop** (`qlmed-app-ci-loop`):

1. Policy versionada em `.ci-loop/policy.json`
2. Medição automatizada (stack, outdated, audit, quality tracks)
3. Proposta via GitHub Issue + PR de patches seguros
4. Orquestração n8n → listener host (mesmo padrão Spec Kit / toolkit sync)
5. Aprovação humana obrigatória para merge e majors

## Consequences

- Scorecard vivo e notificável
- Patches deixam de depender só do Dependabot
- Dívida arquitetural vira track mensurável (não só documento)
- Risco controlado: sem auto-merge, sem majors automáticos
- **Implementation status:** decision accepted; the listener and n8n workflow
  are inactive. Operational status lives in
  [`docs/continuous-improvement.md`](../continuous-improvement.md).
