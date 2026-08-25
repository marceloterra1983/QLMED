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
