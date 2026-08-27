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
