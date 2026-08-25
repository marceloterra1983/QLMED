---
id: SPEC-009
status: approved
owner: QLMED
related_decisions: [ADR-0009]
affected_modules:
  - repository-governance
  - ai-tooling
---

# Feature Specification: AI tooling auto-refresh and mandatory use

## Problem

Spec Kit and Graphify are declared in `AGENTS.md`, but Cursor has no always-on
rule or hook, the Graphify host CLI lags the public latest, and nothing in CI
proves that an AI client can still see the skills and the pin. Agents then
explore the repo with Grep/Read and skip the governance engine.

## User scenarios

### US1 — Every AI client resolves the same tools (P1)

As a maintainer, I need Cursor, Claude Code and Codex to see Spec Kit skills
and Graphify before they change this repository.

- **AC-001**: Cursor always-on rules require Graphify query/path/explain before
  codebase exploration and Spec Kit before behavior/contract changes.
- **AC-002**: Spec Kit skills committed under `.agents/skills/speckit-*` are
  also visible under `.cursor/skills/speckit-*`.
- **AC-003**: A session-start hook injects the Graphify + Spec Kit contract.

### US2 — Tooling stays current without rewriting the constitution (P1)

As an operator, I need CLIs and the knowledge graph to update themselves, while
the Spec Kit project pin stays a reviewed PR.

- **AC-004**: The host Graphify refresh upgrades the Graphify CLI before
  rebuilding graphs.
- **AC-005**: Spec Kit CLI remains host-updated; the project pin in
  `governance.yaml`, `.specify/init-options.json` and
  `.specify/integration.json` stays identical and is not force-upgraded on
  `main`.
- **AC-006**: A scheduled check reports public latest vs pin/CLI and opens or
  updates a drift issue when they differ.

### US3 — Missing wiring fails closed in CI (P1)

As the service owner, I need a merge to be impossible if the AI contract files
disappear or the pin drifts across the three declaration files.

- **AC-007**: `npm run ai-tooling:check` fails when a required rule, skill,
  hook or pin declaration is missing or inconsistent.
- **AC-008**: CI `docs` and `app` jobs run that check.

## Requirements

- **FR-001**: SPEC-003 remains in force. This specification does not raise the
  Spec Kit pin above `0.14.2`.
- **FR-002**: Cursor MUST load Graphify and Spec Kit rules with
  `alwaysApply: true`.
- **FR-003**: The repository MUST expose `scripts/check-ai-tooling.mjs` and
  `npm run ai-tooling:check`.
- **FR-004**: Host Graphify refresh MUST attempt a CLI upgrade before graph
  rebuild. Failure of the upgrade MUST be logged and MUST NOT skip the rebuild
  on the already-installed CLI.
- **FR-005**: Drift detection MUST NOT rewrite constitution, templates or the
  project pin.
- **NFR-001 Security**: Checks, hooks and issues MUST NOT read or emit `.env`
  or secrets.
- **NFR-002 Operability**: Graph artifacts stay gitignored; daily refresh
  remains the source of `graphify-out/`.

## Roles and ownership

- **Maintainer** owns the pin, Cursor rules/hooks and the checker.
- **Host operator** owns Spec Kit CLI updater and Graphify refresh.
- **AI clients** MUST follow the injected contract; they MUST NOT grant
  themselves deploy or pin-upgrade authority.

## Failure cases

- Missing always-on rule, Cursor skill link, session hook or pin mismatch:
  `ai-tooling:check` fails.
- Forced Spec Kit integration upgrade on `main`: rejected by
  [docs/spec-kit.md](../../docs/spec-kit.md) and this specification.
- Drift lookup or issue upsert failure on the scheduled workflow: the workflow
  fails without changing repository files.

## Out of scope

- Upgrading Spec Kit from `0.14.2` to `1.0.1` in this change.
- Application behavior, schema, deploy or production changes.
- Installing Claude Code `hook-guard` into Cursor (Claude-only).
