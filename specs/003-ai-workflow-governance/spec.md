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

QLMED uses Spec Kit as the normative feature-governance engine. GSD is intentionally
disabled (`capability_profile: speckit-only`) so it is not exposed globally and does
not require local entrypoints or a GSD capability lock unless explicitly re-enabled.

## User scenarios

### US1 — Resolve project authority (P1)

As a maintainer, I need every AI client to resolve the same repository policy and
active specification before changing behavior.

- **AC-001**: `AGENTS.md` is canonical and provider adapters do not duplicate policy.
- **AC-002**: `governance.yaml` identifies the pinned Spec Kit feature and validator.

### US2 — Keep GSD disabled unless locally re-enabled (P1)

As an operator, I need GSD off by default so Spec Kit alone governs behavior, with
any future re-enable limited to a pinned, local-only overlay.

- **AC-003**: With `gsd.mode: disabled` and `capability_profile: speckit-only`, the
  repository MUST NOT require GSD entrypoints, local GSD support assets, or
  `.ai/capabilities.lock.json`. Re-enabling GSD MUST add an explicit version pin
  and only declared local entrypoints (no global install).
- **AC-004**: The workspace audit detects GSD mode/pin drift (for example GSD
  enabled without a version pin, or a changed Spec Kit pin), and fails closed.

### US3 — Keep automation fail-closed (P1)

As the service owner, I need AI workflow automation to stop at repository, deployment
and production boundaries unless the applicable authority explicitly allows them.

- **AC-005**: Persistent auto-advance is disabled and interactive mode is the default.
- **AC-006**: Runtime/deploy/migration effects remain privileged-gated independently
  of repository implementation authorization.

## Requirements

- **FR-001**: Spec Kit `0.14.2` MUST remain the normative feature-governance engine.
- **FR-002**: The repository MUST expose one schema-valid root `governance.yaml`.
- **FR-003**: GSD MUST remain `mode: disabled` under `capability_profile:
  speckit-only`. Re-enabling GSD MUST pin an explicit version and limit use to
  declared local-only entrypoints (no global install).
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

- **Maintainer** owns `AGENTS.md`, `governance.yaml`, the Spec Kit pin, and any
  future GSD pin/entrypoints if GSD is re-enabled.
- **Feature owner (QLMED)** owns this specification and its acceptance criteria.
- **AI clients and agents** MUST resolve policy from the canonical repository
  sources and MUST NOT grant themselves repository, deployment or production
  authority.
- **Human reviewer** owns approval before merge; CI remains the authoritative
  implementation gate.

## Failure cases

- If `governance.yaml` is missing, invalid, or contains a changed pin, the audit
  MUST fail closed and identify the discrepancy.
- If GSD is enabled without a version pin or declared entrypoints, or if a
  declared GSD entrypoint or managed asset is missing or modified after
  re-enable, the audit MUST fail closed and identify the path.
- If persistent auto-advance is enabled, or a runtime/deploy/migration effect is
  requested without applicable authority, the workflow MUST stop without
  performing that effect.
- Governance evidence containing secrets or `.env` contents MUST be rejected and
  MUST NOT be emitted in logs or reports.

## Test strategy

- Validate the specification and governance documentation with
  `npm run docs:validate`.
- Exercise the governance audit with fixtures for a valid Spec Kit pin, GSD
  disabled/speckit-only baseline, changed or missing pins, GSD enabled without
  pin/entrypoints, and unauthorized runtime/deploy/migration requests; each
  invalid fixture MUST be rejected.
- Verify the repository quality gates with `npx tsc --noEmit`, `npm run lint`,
  `npm test` and `npm run build`; record the actual results with the feature
  evidence.
- Confirm secret-containment behavior with a fixture containing secret-like and
  `.env` content; the audit MUST reject it without printing the content.

## Out of scope

- Application behavior, schema, deployment or production changes.
- Upgrading Spec Kit beyond the declared current pin, or enabling GSD without an
  explicit pin and declared local entrypoints.
- Enabling GSD or domain MCP servers globally.
