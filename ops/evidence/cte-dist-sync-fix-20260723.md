# CT-e sync gap — causa e correção (2026-07-23)

## Causa
- Sync NSDocs rodava, mas a **loja NSDocs** não tinha CT-e novos após **2026-07-02**.
- App só faz DistDFe SEFAZ para **NF-e**; CT-e dependia do NSDocs.
- Webhook `process-xml` usava FormData field `file` (upload espera `files`).
- Webhook `sync-cte` apontava para `/api/cte/sync` inexistente.

## Correção
1. Catchup via **CTeDistribuicaoDFe** (cert A1) — 10 CT-es 06–22/07 importados (+ 240485 já existia).
2. Script ops `qlmed-cte-dist-sync.js` + wrapper `.sh`.
3. Timer systemd `qlmed-cte-dist-sync.timer` (hourly `:17` UTC).
4. Estado NSU: `/srv/qlmed/ops/state/cte-last-nsu` (= 000000000011702).
5. Webhook `process-xml`/`sync-cte` corrigidos em `app-dev` (deploy pendente).

## Verificação
```sql
SELECT number, "issueDate"::date FROM "Invoice"
WHERE type='CTE' AND "issueDate" >= '2026-07-03' ORDER BY 2;
-- 11 rows (240485 … 245811)
```

## Follow-up (mesmo dia)
- Silent-watchdog: sondas **11** (CT-e import >10d) e **12** (timer/log DistDFe).
- Smoke 11:31 UTC: `ok — nenhuma falha silenciosa detectada`.
- Spec: `charlie/services/silent-watchdog.spec.md` v1.4.
