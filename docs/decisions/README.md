# Architecture decision records

Create one Markdown file per durable decision using `0000-template.md`.

Statuses:

- `proposed`: under review;
- `accepted`: current decision;
- `rejected`: considered but not adopted;
- `deprecated`: no longer recommended and not directly replaced;
- `superseded`: replaced by another ADR.

Accepted records are historical. To change an outcome, add a new ADR and mark
the old record as superseded.

The current QLMED persistence boundary is [ADR-0007](./0007-single-canonical-database.md):
one protected persistent `postgres` database through `DATABASE_URL`, with
`qlmed_ci` reserved for disposable CI replay. Architecture and SPEC-002 should
link to that record instead of duplicating the contract.

AI clients must use Spec Kit and Graphify as [ADR-0009](./0009-ai-tooling-auto-refresh.md):
always-on Cursor rules/hooks, fail-closed `npm run ai-tooling:check`, automatic
CLI/graph refresh, and pin upgrades only by PR.

WhatsApp fiscal (notas recebidas e resumo diário) envia a um grupo único quando
o JID está configurado: [ADR-0010](./0010-whatsapp-group-destination.md).

Toque no celular de nota recebida é Web Push do PWA, canal pessoal `push`:
[ADR-0011](./0011-pwa-web-push-invoice.md).

Login identifica o usuário só pela senha; a tela MUST NOT pedir e-mail.
Auditoria não recoloca o campo sem substituir
[ADR-0012](./0012-password-identity-login.md).

Retenção de dado operacional (AccessLog, NotificationClick, SyncLog, CnpjCache, NcmCache)
com acionamento diário seguro: [ADR-0014](./0014-retencao-de-dado-operacional.md).

Ports & Adapters para Evolution WhatsApp e Microsoft Graph: [ADR-0015](./0015-ports-and-adapters-messaging.md).

Tratamento funcional de erros via Result Types (neverthrow): [ADR-0016](./0016-functional-error-handling-neverthrow.md).

Ciclo de vida simétrico e encerramento gracioso no Supervisor de Background: [ADR-0017](./0017-graceful-lifecycle-supervisor.md).

Trace-as-State para parsers de operadoras e Resiliência HTTP com Jitter Backoff: [ADR-0018](./0018-trace-as-state-parsers-and-resilience.md).

