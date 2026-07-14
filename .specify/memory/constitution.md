# QLMED Constitution

## Core Principles

### I. Executable evidence is mandatory

Behavioral changes MUST have automated evidence proportional to their risk.
Tests, typecheck, lint and build results are authoritative; an agent statement
is not evidence. A test task MUST be included for changed behavior, and the
relevant test MUST fail before a defect fix or new behavior is implemented when
practical.

### II. Authentication and company isolation are server responsibilities

Authorization MUST be enforced in server code. UI visibility is never an
authorization control. Company context MUST be derived through canonical server
helpers from the authenticated identity; request-controlled identifiers MUST
NOT broaden access. Every specification affecting data or APIs MUST describe
role and ownership behavior.

### III. Prisma migrations own durable schema

`prisma/schema.prisma` and ordered migrations are the database source of truth.
New runtime DDL is prohibited. Schema work MUST include migration verification,
development/production separation and rollback consequences. Destructive or
incompatible changes MUST use an explicit expand/contract plan.

### IV. Routes adapt; shared modules implement

HTTP routes MUST authenticate, validate and delegate. Reusable domain,
integration or persistence behavior belongs in `src/lib` and MUST NOT be copied
between routes. Integration clients require bounded failure behavior, safe logs
and a test seam that avoids production systems.

### V. Secrets and fiscal data remain contained

Secrets, credentials, certificates, `.env` files and backups MUST NOT be read
unnecessarily, printed or committed. Complete fiscal XML and sensitive business
payloads MUST NOT be logged. Development automation MUST NOT own production
cron schedules or real webhooks.

### VI. One canonical source per concern

GSD owns roadmap, execution state and continuity. Spec Kit owns each feature's
behavioral contract and technical plan. ADRs own durable decisions; architecture
documents describe current boundaries; code, schema, tests and CI prove the
implementation. Documents MUST link rather than duplicate canonical content.

## Quality gates

Every feature MUST pass `npm run docs:validate`, `npx tsc --noEmit`,
`npm run lint` and the relevant automated tests. Runtime changes MUST pass
`npm run build`. Database changes additionally MUST pass
`npm run db:migrate:verify` and `npm run db:reconcile:verify`.

Specifications MUST include stable requirement and acceptance-criterion IDs,
roles/ownership, failure cases, non-functional requirements, applicable ADRs,
test strategy and explicit out-of-scope items. Material ambiguity MUST be
resolved before implementation.

No workflow in this repository may deploy, publish or touch production unless
that external effect is explicitly requested and separately reviewed.

## Development workflow

1. GSD establishes the delivery phase and references the Spec Kit feature.
2. The feature is specified and clarified before technical planning.
3. The plan checks this constitution and references applicable ADRs.
4. Tasks map to requirements and acceptance criteria with exact paths.
5. Analysis verifies coverage before implementation.
6. Implementation runs deterministic checks and records actual evidence.
7. Human review is required before merge; existing CI remains authoritative.

Durable cross-feature choices require an ADR. Accepted ADRs are superseded by a
new record rather than rewritten. Local reversible implementation choices stay
in the feature plan.

## Governance

This constitution overrides conflicting feature plans or agent suggestions.
Amendments require a documented reason, review of affected templates and a
version change: MAJOR for removed or incompatible principles, MINOR for a new
principle or materially expanded rule, PATCH for clarification.

Compliance is checked during planning, analysis and review. Any exception MUST
be explicit in the plan's Complexity Tracking section, including the rejected
simpler alternative and a removal path.

**Version**: 1.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-07-12

