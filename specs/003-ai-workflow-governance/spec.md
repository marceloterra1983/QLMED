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

- **Maintainer** owns `AGENTS.md`, `governance.yaml` and the declared Spec Kit/GSD
  pins and entrypoints.
- **Feature owner (QLMED)** owns this specification and its acceptance criteria.
- **AI clients and agents** MUST resolve policy from the canonical repository
  sources and MUST NOT grant themselves repository, deployment or production
  authority.
- **Human reviewer** owns approval before merge; CI remains the authoritative
  implementation gate.

## Failure cases

- If `governance.yaml` is missing, invalid, or contains a changed pin, the audit
  MUST fail closed and identify the discrepancy.
- If a declared GSD entrypoint or managed asset is missing or modified, the audit
  MUST fail closed and identify the path.
- If persistent auto-advance is enabled, or a runtime/deploy/migration effect is
  requested without applicable authority, the workflow MUST stop without
  performing that effect.
- Governance evidence containing secrets or `.env` contents MUST be rejected and
  MUST NOT be emitted in logs or reports.

## Test strategy

- Validate the specification and governance documentation with
  `npm run docs:validate`.
- Exercise the governance audit with fixtures for a valid pinned installation,
  changed or missing pins, missing or modified entrypoints, and unauthorized
  runtime/deploy/migration requests; each invalid fixture MUST be rejected.
- Verify the repository quality gates with `npx tsc --noEmit`, `npm run lint`,
  `npm test` and `npm run build`; record the actual results with the feature
  evidence.
- Confirm secret-containment behavior with a fixture containing secret-like and
  `.env` content; the audit MUST reject it without printing the content.

## Out of scope

- Application behavior, schema, deployment or production changes.
- Upgrading Spec Kit or GSD beyond the declared current pins.
- Enabling GSD or domain MCP servers globally.
