# Evidência — supressão de notificação CT-e DistDFe catchup (2026-07-23)

## Problema
Catchup DistDFe importou ~10 CT-es antigos (issueDate 2026-07-07..22) via
`POST /api/invoices/upload` → `createInvoiceWithOutbox`, enfileirando WhatsApp/email
no outbox Postgres (worker `*/10`).

## Estado encontrado (prod DB)
| number | issueDate | sent | pending (antes) |
|--------|-----------|------|-----------------|
| 987548 | 2026-07-07 | 0 | 11 |
| 987551 | 2026-07-07 | 0 | 11 |
| 38704499 | 2026-07-08 | 11 | 0 |
| 36651 | 2026-07-10 | 11 | 0 |
| 990541 | 2026-07-13 | 11 | 0 |
| 148309 | 2026-07-15 | 11 | 0 |
| 86418 | 2026-07-15 | 6 | 5 |
| 678148 | 2026-07-16 | 0 | 11 |
| 36883 | 2026-07-17 | 0 | 11 |
| 245811 | 2026-07-22 | 0 | 11 |

- **Já enviados (irreversível):** 50 deliveries (`sent`)
- **Cancelados:** 60 deliveries `pending` → `dead` com reason
  `Suppressed: DistDFe catchup CTE (issueDate older than ingest day; ops 2026-07-23)`
- **Actionable restante para esses CTEs:** 0

## Correção durável (app-dev + ops; sem commit)
1. **Age gate** em `enqueueInvoiceEvent` — não enfileira se `issueDate` >
   `NOTIFICATION_MAX_AGE_HOURS` (default **48h**). Afeta upload, NSDocs, Sefaz, etc.
2. **`skipNotification=true`** no multipart de `/api/invoices/upload` →
   `createHistoricalInvoiceWithoutOutbox` (mesmo padrão de `nsdocs/import-period`).
3. **DistDFe script** (`ops/scripts/qlmed-cte-dist-sync.js`):
   - envia `skipNotification` quando `dhEmi` > `CTE_NOTIFY_MAX_AGE_HOURS` (48);
   - safety net: `UPDATE ... status='dead'` por accessKey até o app deployar o gate.

## Deploy necessário
O container `qlmed-app` roda build `.next` de 2026-07-22 — age-gate/flag só
entram após próximo deploy de `app-dev`. Até lá o safety net do DistDFe cobre
ingests futuros do timer.

## Watchdog
Sondas 11/12 em `silent-watchdog.sh` já cobrem frescor de import CT-e e timer
DistDFe — sem alteração nesta sessão.
