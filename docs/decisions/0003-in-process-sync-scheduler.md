---
id: ADR-0003
status: superseded
date: 2026-07-22
supersedes: null
related_specs: []
---

# Scheduler de sincronização fiscal roda in-process no servidor Next.js

## Context

As sincronizações periódicas com fontes fiscais (SEFAZ, NSDocs, Receita/NFS-e) e
o watcher local de XML são disparados por um scheduler in-process
(`src/lib/sync-scheduler.ts`) via `setInterval`/`setTimeout`. O bootstrap é
disparado a partir de `src/lib/prisma.ts` (import dinâmico de
`src/lib/bootstrap.ts`); `instrumentation.register()` só roda `validateEnv()`.
Não há lock distribuído. O painel de especialistas (2026-07-22) apontou o teto
de escala horizontal: múltiplas réplicas duplicariam o sync.

## Decision drivers

- Simplicidade operacional: hoje há **uma** instância do `qlmed-app`.
- Sync precisa acontecer de forma confiável e sem duplicação.
- Não introduzir infraestrutura (worker dedicado/fila) sem necessidade real.

## Considered options

### Option A — Scheduler in-process (estado atual)

Simples, sem componentes extras. Acoplado ao processo web; não escala
horizontalmente sem duplicar trabalho.

### Option B — Worker dedicado / fila externa

Desacopla o sync do web; escala. Custo: mais um serviço para operar e monitorar.

### Option C — In-process guardado por advisory-lock do Postgres

Mantém a simplicidade e permite futura réplica sem duplicar sync
(`pg_try_advisory_lock`, padrão já usado em `postgres-advisory-lock.ts`).

## Decision

**Option A por ora, com Option C como próximo passo quando/se houver >1 réplica.**
Enquanto o deploy for de instância única, o scheduler in-process é adequado.
Antes de escalar horizontalmente, o ciclo de sync deve ser guardado por
advisory-lock (ou externalizado), para não duplicar chamadas a SEFAZ/NSDocs/Receita.

## Consequences

### Positive

- Zero infraestrutura extra hoje; sync confiável na instância única.

### Negative

- Escala horizontal está bloqueada até adotar a Option C (ou B).
- Sync está acoplado ao ciclo de vida do processo web.

## Verification

- Enquanto instância única: sync roda uma vez por ciclo (sem duplicação).
- Ao adicionar réplica: confirmar advisory-lock guardando o ciclo antes do rollout.
