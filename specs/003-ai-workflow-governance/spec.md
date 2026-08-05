---
id: SPEC-003
status: approved
owner: QLMED
related_decisions: []
affected_modules:
  - repository-governance
  - ai-tooling
---

# Feature Specification: AI workflow governance

## Problem

QLMED already uses Spec Kit and GSD, but the server-wide baseline previously exposed
GSD globally and the repository did not declare a machine-readable capability pin.
That made workflow authority, automation level and drift difficult to audit.

## User scenarios

### US1 — Resolve project authority (P1)

As a maintainer, I need every AI client to resolve the same repository policy and
active specification before changing behavior.

- **AC-001**: `AGENTS.md` is canonical and provider adapters do not duplicate policy.
- **AC-002**: `governance.yaml` identifies the pinned Spec Kit feature and validator.

### US2 — Use GSD only when locally adopted (P1)

As an operator, I need GSD available for durable work without exposing its full
workflow surface globally.

- **AC-003**: Only the declared GSD entrypoints and their local support assets are
  installed below the QLMED repository.
- **AC-004**: The workspace audit detects a changed pin, missing entrypoint or modified
  managed asset.

### US3 — Keep automation fail-closed (P1)

As the service owner, I need AI workflow automation to stop at repository, deployment
and production boundaries unless the applicable authority explicitly allows them.

- **AC-005**: Persistent auto-advance is disabled and interactive mode is the default.
- **AC-006**: Runtime/deploy/migration effects remain privileged-gated independently
  of repository implementation authorization.

## Requirements

- **FR-001**: Spec Kit `0.14.2` MUST remain the normative feature-governance engine.
- **FR-002**: The repository MUST expose one schema-valid root `governance.yaml`.
- **FR-003**: GSD `1.41.2` MUST be local-only and limited to explicitly declared
  entrypoints.
- **FR-004**: The global Superpowers-lite profile MAY supply engineering safeguards
  but MUST NOT grant scope or authorization.
- **FR-005**: Agents MUST work in task-specific worktrees and preserve unrelated work.
- **FR-006**: Completed GSD milestones MUST NOT remain marked as executing.
- **NFR-001 Security**: Governance evidence MUST contain no secret values or `.env`
  contents.
- **NFR-002 Reliability**: Local capability installation and diff MUST be deterministic
  and fail closed on version skew.
- **NFR-003 Operability**: Rollback MUST remain available through the server Toolkit
  snapshot referenced by the server governance evidence.

## Roles and ownership

- **ROLE-001 (maintainer)**: owns the canonical workflow policy in `AGENTS.md`,
  this specification and the root `governance.yaml`; evidence: `AGENTS.md` and
  `governance.yaml`.
- **ROLE-002 (service owner)**: owns the privileged runtime, deployment and
  migration boundary and the rollback evidence; evidence: `governance.yaml`
  (`runtime_effects`) and `AGENTS.md` safety boundaries.
- **ROLE-003 (AI client/operator)**: resolves the canonical policy and active
  specification before implementation and MUST stop on an unmet gate; evidence:
  AC-001, AC-004 and AC-006.

## Failure cases

- **FC-001**: If `governance.yaml` is missing, malformed or has a changed Spec
  Kit pin, `npm run docs:validate` MUST fail and implementation MUST stop;
  evidence: FR-001, FR-002 and the validator pin in `governance.yaml`.
- **FC-002**: If a declared GSD entrypoint or managed asset is missing or
  modified, the workspace audit MUST report drift and MUST NOT auto-advance;
  evidence: AC-004 and AC-005.
- **FC-003**: If an operation requests runtime, deployment or migration effects
  without explicit privileged authority, it MUST be blocked independently of
  repository implementation authorization; evidence: AC-006 and
  `governance.yaml` (`runtime_effects`).
- **FC-004**: If governance evidence contains a secret or `.env` content, the
  evidence is invalid and MUST be removed before approval; evidence: NFR-001
  and `AGENTS.md` safety boundaries.

## Applicable decisions and exceptions

- **DEC-001**: No database, schema or runtime boundary changes are in scope, so
  ADR-0007 is explicitly not applicable to this feature; evidence: the
  `Out of scope` section and `docs/decisions/0007-single-canonical-database.md`.
- **DEC-002**: Workflow authority remains in `AGENTS.md`; provider adapters and
  governance metadata reference it instead of duplicating policy; evidence:
  AC-001 and Principle VI of the constitution.

## Test strategy

- **TS-001**: Run `npm run docs:validate` to verify document structure, stable
  IDs, internal references and the `governance.yaml` validator contract; covers
  FR-001, FR-002, AC-001 and AC-002.
- **TS-002**: Run the workspace audit against the declared pins, entrypoints and
  managed assets; assert changed or missing inputs fail closed; covers AC-003,
  AC-004 and FC-002.
- **TS-003**: Review the governance evidence for privileged gating and absence
  of secrets or `.env` content; covers AC-005, AC-006, NFR-001 and FC-003/FC-004.
- **TS-004**: This remediation changes specification text only; application
  typecheck, lint, build and runtime tests are not acceptance evidence for this
  document-only change.

## Out of scope

- Application behavior, schema, deployment or production changes.
- Upgrading Spec Kit or GSD beyond the declared current pins.
- Enabling GSD or domain MCP servers globally.
