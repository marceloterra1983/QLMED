---
id: ADR-0009
status: accepted
date: 2026-08-25
supersedes: null
related_specs:
  - SPEC-003
  - SPEC-009
---

# ADR-0009 — Spec Kit e Graphify obrigatórios, pin revisado

## Context

IAs neste repositório ignoravam Graphify e Spec Kit mesmo com texto em
`AGENTS.md`. O CLI Spec Kit no host já atualiza sozinho; o pin do projeto e o
CLI Graphify não. Forçar `specify integration upgrade` em `main` reescreveria
constituição e templates customizados.

## Decision drivers

- Toda pergunta de código deve começar pelo grafo quando ele existe.
- Toda mudança de comportamento precisa de Spec Kit.
- Atualização automática só onde o efeito é reversível e não reescreve o
  contrato versionado do projeto.

## Considered options

### Option A — Force-upgrade Spec Kit e Graphify no pin a cada latest

Benefício: IAs sempre veem o toolkit mais novo. Custo: merge cego da
constituição e dos templates; viola SPEC-003 FR-001.

### Option B — Só documentação em AGENTS.md

Benefício: zero arquivos novos. Custo: IAs continuam sem rule/hook; já falhou.

### Option C — Contrato no repo + auto-update de CLI/grafo + drift do pin

Benefício: Cursor e CI obrigam o uso; CLI e grafo sobem sozinhos; pin sobe só
com PR. Custo: latest do Spec Kit no host pode ficar à frente do pin.

## Decision

Adotar a opção C.

- Cursor: rules `alwaysApply`, skills e hook `sessionStart`.
- CI: `npm run ai-tooling:check` falha fechado se o contrato sumir.
- Host: updater Spec Kit (já existente) e refresh Graphify passam a atualizar
  o CLI Graphify antes do rebuild do grafo.
- Pin Spec Kit `0.14.2` permanece até um PR dedicado. Drift vira issue, não
  merge automático.

## Consequences

### Positive

- IAs no Cursor recebem o contrato em toda sessão.
- Pin inconsistente entre os três arquivos de declaração falha no CI.

### Negative

- Skills Spec Kit do projeto ficam na 0.14.2 enquanto o CLI do host pode ser
  1.0.x. Isso é intencional.

## Verification

`npm run ai-tooling:check` e o workflow semanal de drift.
