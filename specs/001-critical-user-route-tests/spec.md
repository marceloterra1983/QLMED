---
id: SPEC-001
status: approved
owner: QLMED
related_decisions: []
affected_modules:
  - users-api
  - authorization
---

# Feature Specification: Critical user administration route tests

**Feature Branch**: `main` (pilot does not alter branch strategy)  
**Created**: 2026-07-12  
**Status**: Approved

## Problem

The user administration mutation route changes roles, account status, page
permissions and passwords, but has no direct route-level regression tests. A
regression could weaken admin-only access, allow an administrator to lock
themselves out, or fail to invalidate sessions after a sensitive change.

## User scenarios and testing

### User Story 1 — Reject unauthorized administration (Priority: P1)

As the system owner, I need non-admin requests rejected before user data is
read or changed.

**Independent Test**: Invoke the PATCH handler with authentication failures and
verify 401/403 responses and zero persistence calls.

**Acceptance Scenarios**:

1. **AC-001** — Given no authenticated identity, when PATCH is invoked, then it
   returns 401 and performs no user lookup or update.
2. **AC-002** — Given an authenticated non-admin identity, when PATCH is
   invoked, then it returns 403 and performs no user lookup or update.

### User Story 2 — Preserve administrator self-protection (Priority: P1)

As an administrator, I must not demote or deactivate my own account.

**Independent Test**: Invoke PATCH for the acting administrator with each
forbidden change and verify a 400 response before persistence.

**Acceptance Scenarios**:

1. **AC-003** — Given an admin targets their own ID, when requesting a non-admin
   role, then the route returns 400 without updating the user.
2. **AC-004** — Given an admin targets their own ID, when requesting a
   non-active status, then the route returns 400 without updating the user.

### User Story 3 — Invalidate sessions after sensitive changes (Priority: P1)

As the system owner, I need existing sessions invalidated when another user's
role, status, allowed pages or password changes.

**Independent Test**: Update another user and verify `tokenVersion` is
incremented and the action is attributed to the acting administrator.

**Acceptance Scenarios**:

1. **AC-005** — Given an admin changes another user's role, when PATCH succeeds,
   then the update increments `tokenVersion` and returns no password hash.
2. **AC-006** — Given a successful sensitive change, when audit writes are
   scheduled, then they identify the acting admin and target user without
   exposing credentials.

## Requirements

### Functional requirements

- **FR-001**: Tests MUST prove unauthenticated requests return 401.
- **FR-002**: Tests MUST prove authenticated non-admin requests return 403.
- **FR-003**: Tests MUST prove self-demotion and self-deactivation are rejected.
- **FR-004**: Tests MUST prove sensitive changes increment `tokenVersion`.
- **FR-005**: Tests MUST prove responses do not expose `passwordHash`.
- **FR-006**: Tests MUST prove audit writes attribute the acting administrator.

### Roles and ownership

- **ROLE-001**: Only an administrator may mutate another user's administrative
  attributes.
- **OWN-001**: The acting administrator ID comes from server authentication,
  never from the request body.

### Non-functional requirements

- **NFR-001 Security**: Tests use mocks and contain no real credentials or
  production data.
- **NFR-002 Reliability**: Tests are deterministic and perform no network or
  database I/O.
- **NFR-003 Observability**: Audit assertions inspect safe IDs and action names,
  not secrets.

## Edge cases

- An authorization error other than `FORBIDDEN` is treated as unauthenticated.
- Self-protection is checked before the target user is loaded.
- A sensitive update increments the token version atomically with the update.

## Success criteria

- **SC-001**: Six acceptance criteria are covered by deterministic Vitest tests.
- **SC-002**: The focused test file passes with no DB or network access.
- **SC-003**: Documentation validation, typecheck, lint and full unit tests pass.
- **SC-004**: Production code behavior remains unchanged by the pilot.

## Assumptions

- Existing route behavior is intentional and becomes the regression contract.
- Fire-and-forget audit writes may resolve asynchronously but must be scheduled
  with correct safe attribution.

## Out of scope

- Changing the users API behavior.
- Adding end-to-end browser tests.
- Deploying or publishing the pilot.
- Testing user creation or list operations in this feature.

## Related decisions

- None — this feature records existing security behavior and introduces no
  durable architecture choice.

