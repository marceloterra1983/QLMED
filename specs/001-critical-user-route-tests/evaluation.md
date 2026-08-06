# Pilot evaluation

**Decision (pilot, historical):** Adopt Spec Kit for behaviorally significant
QLMED features; the pilot also retained GSD as the delivery orchestrator.

**Superseded by:** SPEC-003 (`specs/003-ai-workflow-governance`) and
`governance.yaml` (`gsd.mode: disabled`, `capability_profile: speckit-only`).
Spec Kit is normative; GSD is historical continuity only and may be used only
if re-enabled with pin and declared entrypoints.

## Evidence

| Measure | Result |
|---------|--------|
| Acceptance criteria | 6 defined, 6 covered |
| New focused tests | 9 passed |
| Full unit suite | 125 passed, 3 skipped |
| Test files | 16 passed, 2 skipped |
| Documentation validation | 14 Markdown files, 2 IDs, passed |
| Typecheck | passed |
| Lint | passed |
| Production build | passed, 97 static pages generated |
| Production source changed | 0 files |
| Database/network use by focused test | none |
| Human clarification during execution | none after scope approval |

## Retrieval check

Starting from `AGENTS.md`, an agent can locate:

- the behavioral contract at `specs/001-critical-user-route-tests/spec.md`;
- durable constraints in `.specify/memory/constitution.md`;
- current security boundaries in `docs/architecture/boundaries.md`;
- executable evidence in `src/lib/__tests__/users-route.test.ts`;
- delivery state under `.planning/` when GSD is re-enabled; otherwise Spec Kit
  feature artifacts under `specs/` are the execution trace.

## Friction and adjustments

- Spec Kit tasks own feature traceability. If GSD is re-enabled, it records
  execution continuity only; neither copies the other's narrative.
- Customized managed templates make `specify integration status` report a
  warning. This is accepted and documented; upgrades require a disposable
  branch and manual diff review.
- Initialization must always set the project working directory explicitly. An
  early scaffold was created at the parent root, detected immediately and moved
  intact to `/tmp/spec-kit-root-footprint-20260712`; the pilot repository was
  then initialized correctly.
- A fixture initially contained an incorrect relative link. The negative signal
  proved the link validator worked; the fixture was corrected before commit.

## Adoption policy

Use Spec Kit for observable behavior, contracts, permissions, persistence,
integrations or significant non-functional requirements. With GSD disabled
(`capability_profile: speckit-only`), do not require a GSD plan; if GSD is
locally re-enabled, a small GSD-only plan may cover localized maintenance with
no behavioral or architectural effect. Create ADRs only for durable
cross-feature choices.

Do not add a multiagent framework, MCP, RAG or vector database at this stage.

