# Findings de L7-cursor

## QLMED-FISCAL-007 — SEFAZ/Receita avançam checkpoint com documento falho; NSDocs não
- severidade: high | status: confirmed | confiança: high
- local: src/lib/sync-strategies/sefaz.ts:80 (ultNSU); src/lib/receita-nfse-sync.ts:185 (lastNsu)
- invariante: Cursor não avança além de item não persistido.
- cenário: SEFAZ: ultNSU de qualquer resposta, inclusive erro; catch de doc continua. Receita: lastNsu no passo com conteúdo mesmo se parse skip. NSDocs: lastSyncAt só se skippedCount=0.
- esperado: partial + cursor no item falho ou dead-letter durável.
- observado: sefaz.ts:80-81,170-198; receita-nfse-sync.ts:185-193; nsdocs.ts:157-170.
- causa raiz: Tratar ultNSU do provedor como progresso de ingestão.
- correção mínima: Não persistir cursor além de falha; ou gravar skip durável por chave.
- teste de regressão: Mock doc XML inválido: lastNsu inalterado ou skip row; retry reprocessa.
- risco residual: SEFAZ 656 se reconsultar o mesmo NSU demais.

## QLMED-FISCAL-008 — Recovery de sync stuck pode sobrepor job vivo; scheduler in-process não é multi-réplica
- severidade: high | status: confirmed | confiança: high
- local: src/lib/sync-scheduler.ts:212 (recoverStuckSyncLogs)
- invariante: Um método de sync por empresa por vez, inclusive após 30 min.
- cenário: Recovery só olha startedAt. Advisory lock só na inserção do SyncLog. started é flag de processo.
- esperado: Lock de sessão no run inteiro; recover só se backend_pid morto.
- observado: sync-scheduler.ts:34,195-237; postgres-advisory-lock.ts:39-54; ADR-0003/0008.
- causa raiz: Lock de linha running não cobre o run; recovery sem liveness.
- correção mínima: pg_try_advisory_lock no loop; recover com pid; não marcar error se lock ainda held.
- teste de regressão: Job >30min com lock vivo não cria segundo running.
- risco residual: ADR-0003 assume um processo.

## QLMED-OBS-002 — Heartbeat de background não degrada com idade
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/background-service-health.ts:52 (getBackgroundServiceHealth)
- invariante: Serviço sem heartbeat recente não é running.
- cenário: Copia timestamp; status running permanece.
- esperado: stale → degraded.
- observado: background-service-health.ts:33-56.
- causa raiz: Heartbeat é last-write, não TTL.
- correção mínima: Se now-heartbeat > 2*interval → error.
- teste de regressão: heartbeat 1h atrás → não running.
- risco residual: n/a
