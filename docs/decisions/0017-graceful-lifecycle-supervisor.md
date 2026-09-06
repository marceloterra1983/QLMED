---
id: ADR-0017
status: accepted
date: 2026-09-06
supersedes: null
related_specs: []
---

# Ciclo de vida simétrico e encerramento gracioso no Supervisor de Background

## Context

A aplicação Next.js no servidor de produção executa 9 daemons em background (sincronizadores fiscais, watchers de diretório, ingestores de e-mail e jobs de outbox). Anteriormente, os serviços possuíam métodos `start...()`, porém não ofereciam `stop...()` simétricos que cancelassem `setInterval`, `setTimeout` e fechassem listeners de `FSWatcher`. Durante recargas ou encerramentos, timers órfãos mantinham o event loop retido e geravam potenciais execuções concorrentes.

## Decision drivers

- Evitar timers zumbis e vazamento de conexões ou descritores de arquivo (FSWatcher).
- Suporte a `SIGTERM` e `SIGINT` emitidos pelo Docker, systemd e deploy runner.
- Respeitar o ciclo de vida in-process conforme [ADR-0003](./0003-in-process-sync-scheduler.md).

## Considered options

### A — Encerramento abrupto (`process.exit(0)`)
Ignorar finalização graciosa dos loops. Custo: queries no meio de transações podem ser abortadas e processos de arquivo corrompidos.

### B — Ciclo de vida simétrico e Graceful Shutdown no Supervisor
Adicionar métodos `stop...()` com cancelamento explícito de timers e fechamento de watchers a todos os 9 daemons e conectá-los a `BackgroundSupervisor.stopAll()`, com hooks para `SIGTERM`/`SIGINT`.

## Decision

**Opção B.** Implementado em Wave 5 (PR #374). Cada serviço em background expõe seu respectivo método de parada simétrico:
- `stopAutoSync()` e `stopNightlyRebuild()`
- `stopLocalXmlSync()` (cancela timers e executa `watcher.close()`)
- `stopImpcgMailIngest()`, `stopCassemsMailIngest()`, `stopUnimedCgMailIngest()`
- `stopDocumentosIngest()`, `stopDocumentosAlert()`
- `stopDailyIssuedSummary()`
- `stopNotificationOutboxPurge()`

O supervisor gerencia a parada em ordem reversa ou paralela quando o processo recebe sinal de terminação do sistema operacional.

## Consequences

### Positive
- Encerramento limpo e determinístico da aplicação sem travar o event loop do Node.js.
- Eliminação de concorrência espúria durante recargas de deploy.

### Negative
- Necessidade de manter a disciplina de registrar métodos `stop` para qualquer novo daemon adicionado ao catálogo.

## Verification
- Testes unitários do supervisor em `src/lib/__tests__/background-supervisor.test.ts` simulando inicialização, falhas e shutdown gracioso.
