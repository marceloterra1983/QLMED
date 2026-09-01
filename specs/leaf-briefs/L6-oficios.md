# Findings de L6-oficios

## QLMED-JOB-001 — IMPCG/CASSEMS grava PDF no OneDrive antes da transação
- severidade: high | status: confirmed | confiança: high
- local: src/lib/impcg/ingest.ts:368 (uploadOneDriveFile)
- invariante: Objeto remoto e linha DB commitam juntos ou o remoto é GC.
- cenário: upload então persistConfirmed; falha deixa órfão; próximo tick re-upload.
- esperado: TX depois upload com GC; ou upload após commit com retry.
- observado: impcg/ingest.ts:368-432; cassems/ingest.ts:287-351.
- causa raiz: Efeito externo antes do commit.
- correção mínima: Marcar upload pendente; GC órfãos; ou persist first + upload + update url.
- teste de regressão: persist throw → nenhum objeto novo ou GC na próxima tick.
- risco residual: GC OneDrive precisa permissão delete.

## QLMED-JOB-002 — persistSourceOnly engole qualquer erro como conflito de dedup
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/impcg/store.ts:467 (persistSourceOnly)
- invariante: Só unique violation é skip; o resto falha o tick.
- cenário: catch {} vazio.
- esperado: catch P2002 only.
- observado: impcg/store.ts:467-480; cassems/store.ts:376-389.
- causa raiz: Dedup amplo demais.
- correção mínima: if P2002 skip else throw.
- teste de regressão: throw genérico incrementa errors.
- risco residual: n/a

## QLMED-JOB-003 — WhatsApp IMPCG/CASSEMS após persist sem retry durável
- severidade: high | status: confirmed | confiança: high
- local: src/lib/impcg/ingest.ts:401 (notifyImpcgAuthorization)
- invariante: Falha de notificação após origem persistida entra em outbox/retry.
- cenário: notify in-process; próximo tick vê source e continue; markWhatsAppSent não gateia.
- esperado: Outbox channel ou flag whatsappSentAt com retry.
- observado: ingest.ts:338-434; SPEC-031 out-of-scope reenvio.
- causa raiz: Notificação acoplada ao ingest sem máquina de entrega.
- correção mínima: Usar notification outbox ou persistir sentAt e reprocessar sentAt IS NULL.
- teste de regressão: Evolution 500: próxima tick tenta de novo ou delivery pending.
- risco residual: SPEC owner pode aceitar perda; então documentar explicitamente no runbook.

## QLMED-JOB-004 — ok:true e lastSuccessAt após falha parcial IMPCG/CASSEMS
- severidade: high | status: confirmed | confiança: high
- local: src/lib/impcg/ingest.ts:481 (ok)
- invariante: Sucesso operacional exige mailbox+upload+persist+notify honestos.
- cenário: ok sempre true se lock adquirido; lastSuccessAt=now; sync omite failedUploads.
- esperado: ok false / partial; lastSuccessAt só se zero erros materiais.
- observado: impcg/ingest.ts:473-488; sync/route.ts:23-29.
- causa raiz: Heartbeat de tick ≠ sucesso de pipeline.
- correção mínima: Distinguir completed/partial/error; não avançar lastSuccessAt em partial.
- teste de regressão: failedUploads>0 → ok false e lastSuccessAt inalterado.
- risco residual: n/a

## QLMED-JOB-005 — Outbox fiscal sem teto de tentativas pré-submit nem retenção
- severidade: medium | status: confirmed | confiança: high
- local: src/lib/notification-outbox.ts:386 (retry)
- invariante: Poison pré-submit vira dead; eventos antigos expiram.
- cenário: backoff 6h mas status nunca dead por attempts; sem purge.
- esperado: max attempts; TTL.
- observado: notification-outbox.ts:161-411; schema sem TTL.
- causa raiz: Retry infinito em asset fetch.
- correção mínima: attempts>=N → dead; job de purge.
- teste de regressão: 5 falhas pré-submit → dead.
- risco residual: n/a
