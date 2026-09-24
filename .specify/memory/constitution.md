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
New runtime DDL is prohibited. The persistent runtime uses the protected
canonical `DATABASE_URL` and the `postgres` database; CI uses only the
disposable `qlmed_ci` database. `qlmed_dev`, arbitrary database names and
parallel URL aliases are not supported. Schema work MUST include migration
verification, compatibility and rollback consequences. Destructive or
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

Spec Kit owns each feature's behavioral contract and technical plan and is the
mandatory governance gate. GSD is disabled by default (`gsd.mode=disabled`,
`capability_profile: speckit-only` in `governance.yaml`) unless re-enabled
locally with a pinned overlay and declared entrypoints; when re-enabled, GSD
may own roadmap, execution state and continuity only. ADRs own durable
decisions; architecture documents describe current boundaries; code, schema and
tests prove the implementation. The authoritative proof that a revision may
reach production is the local release receipt emitted by the gate that runs
inside the isolated container (ADR-0021), written to
`/home/marce/qlmed/var/release-receipts/<sha>.json` only after exit 0. The
GitHub Actions result is a mirror signal and is not the authority. Documents
MUST link rather than duplicate canonical content.

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

1. Spec Kit is the required entry: specify and clarify the feature before
   technical planning. GSD does not establish the phase while disabled; if
   re-enabled under a pinned overlay, it may track delivery phase and continuity
   only, referencing the Spec Kit feature.
2. The plan checks this constitution and references applicable ADRs.
3. Tasks map to requirements and acceptance criteria with exact paths.
4. Analysis verifies coverage before implementation.
5. Implementation runs deterministic checks and records actual evidence.
6. Merge to production is authorized by two things together: the local release
   receipt emitted inside the isolated container (ADR-0021) and human review at
   the local merge. The GitHub Actions result is a mirror signal, not the
   authority. The release gate MUST NOT run as the host user; it runs in the
   isolated container, and `127.0.0.1:5433` / `127.0.0.1:5435` are not its
   database.

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

### Amendment 1.0.1 — canonical persistence boundary (2026-08-03)

ADR-0007 clarifies Principle III after the repository reconciliation found that
the previously documented `qlmed_dev` persistent database does not exist in the
current stack. The amendment preserves versioned migrations and adds the
explicit distinction between the protected persistent `postgres` database and
the disposable CI database `qlmed_ci`; it does not authorize live migrations or
alter the backup project. The affected specification, plan and task templates
were reviewed together with this amendment.

### Amendment 1.0.2 — GSD optional / Spec Kit gate (2026-08-06)

Principle VI and the development workflow previously treated GSD as the default
delivery orchestrator. That contradicted `governance.yaml` (`gsd.mode=disabled`,
`capability_profile: speckit-only`) and SPEC-003. Spec Kit is the mandatory
gate; GSD remains off unless re-enabled with a pinned overlay. PATCH only;
templates reviewed — no incompatible principle removed.

### Amendment 2.0.0 — local release receipt replaces GitHub CI as authority (2026-09-23)

Principle VI and workflow step 6 previously made the existing GitHub CI the
authority for merge. That authority proved to depend on something outside the
code: in August 2026 an account billing block made GitHub stop creating jobs,
so `main` stayed closed while the suite passed locally. Running the suite as the
host user was never an option — SPEC-013 FR-001 forbids it, because that user is
in the `docker` group and reaches the fiscal writer, certificates and backups.

The amendment separates the invoker from the execution environment. The
environment is unchanged: the gate runs inside the isolated container
`github-runner-qlmed-ci-linux-01-runner-linux-1` (uid 10001, `internal` network,
`qlmed-ci-db:5432` sidecar). Only the invoker changes, from GitHub Actions to
`docker exec` on the host. Authority for merge to production becomes the local
receipt emitted from that container plus human review at the local merge; GitHub
becomes a mirror. MAJOR, because the previous rule that GitHub CI is
authoritative is removed and replaced by an incompatible one. Templates and the
Quality gates section were reviewed; the required checks themselves are
unchanged. This amendment does not disable any workflow and does not alter the
`main` ruleset. Decision: ADR-0021. Contract: SPEC-087.

**Version**: 2.0.0 | **Ratified**: 2026-07-12 | **Last Amended**: 2026-09-23
