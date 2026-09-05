# Plan: SPEC-045 Unimed CG Autorizações

## Objetivo

Espelhar CASSEMS/IMPCG de forma enxuta: mail HTML → link → PDF → OneDrive → Prisma → WhatsApp → UI.

## Arquitetura

1. `graph-mail-client`: `listMailboxMessagesBySenderWithoutAttachments` + `getMailboxMessageBodyHtml`
2. `src/lib/unimed-cg/*`: constants, parse-page, store, ingest, onedrive, whatsapp, access
3. `src/lib/pdf/render-url.ts`: Puppeteer goto com allowlist
4. Prisma: UnimedCgAuthorization / SourceMessage / IngestState
5. UI/API `/gestao/unimed-cg` + navigation/sidebar/bootstrap/rotinas

## Persistência

- Unique `(companyId, processId)`
- `parseStatus`: ok se processId + authorizationNumber + total + location
- Sem `AuthorizationItem` na v1

## Ops

- Env: `UNIMED_CG_WHATSAPP_ENABLED`, `UNIMED_CG_WHATSAPP_GROUP_JID`
- Migration expand-only + pin em `verify-production-migration-window.cjs`
- Intervalo 15 min
