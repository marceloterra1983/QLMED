# Integration boundaries

QLMED integrates with fiscal providers and operational services, including
SEFAZ, NSDocs, Receita NFS-e, OneDrive and messaging/notification channels.

Every integration must define:

- authentication and secret source;
- request timeout and retry behavior;
- idempotency or duplicate-handling strategy;
- safe error and audit logging;
- test seam that does not contact production;
- behavior when the provider is unavailable.

Development automations must use manual triggers and must not activate real
production cron or webhook ownership.

WhatsApp fiscal (notas recebidas e resumo diário de emitidas) envia a um
grupo quando `NOTIFICATION_WHATSAPP_GROUP` ou `QLMED_WHATSAPP_GROUP_JID`
contém um JID `…@g.us`. Sem o valor, permanece o fan-out por telefone.
Ver [ADR-0010](../decisions/0010-whatsapp-group-destination.md) e
[SPEC-015](../../specs/015-whatsapp-group-destination/spec.md).
O texto WhatsApp de CT-e recebido é curto (marca, origem ➡️ destino, valor;
sem número e sem chave). Ver [SPEC-017](../../specs/017-cte-whatsapp-caption/spec.md).
No resumo diário de emitidas, nota que não é venda leva `(CONSIG.)` depois
do valor. Ver [SPEC-018](../../specs/018-daily-summary-consig/spec.md).

Nota recebida também pode tocar o PWA (Web Push, canal `push`) quando o
usuário autoriza o aparelho e o VAPID está configurado.
Ver [ADR-0011](../decisions/0011-pwa-web-push-invoice.md) e
[SPEC-016](../../specs/016-pwa-invoice-push/spec.md).

## n8n webhook

`POST /api/webhooks/n8n` always requires `x-api-key`. When
`N8N_WEBHOOK_SECRET` is configured, the producer must also send:

- `x-qlmed-timestamp`: Unix seconds, within five minutes of the server clock;
- `x-qlmed-nonce`: unique request token;
- `x-qlmed-signature`: lowercase or uppercase HMAC-SHA256 hex of
  `timestamp.nonce.raw_request_body`.

The nonce cache is process-local. A shared cache is required before scaling the
webhook consumer horizontally. Configure the secret only after the active n8n
workflow has been updated and tested with the same secret.
