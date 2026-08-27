# Data model: SPEC-016

## NotificationChannel

Valor novo: `push`. Expand-only.

## PushSubscription

| Campo | Significado |
|---|---|
| id | cuid |
| userId | dono; cascade |
| endpoint | URL HTTPS única |
| p256dh | chave do cliente |
| auth | segredo do cliente |
| createdAt / updatedAt | auditoria |

Índices: `userId`, unique `endpoint`.

Sem `companyId`: identidade, como `UserNotificationPreference`.

## NotificationDelivery

`channel = push`, `recipient = endpoint` normalizado. Idempotência
`eventKey + channel + endpoint`.
