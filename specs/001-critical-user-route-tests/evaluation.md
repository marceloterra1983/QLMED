# Pilot evaluation

**Decision:** Adopt Spec Kit for behaviorally significant QLMED features, with
GSD retained as the delivery orchestrator.

## Evidence

| Measure | Result |
|---------|--------|
| Acceptance criteria | 6 defined, 6 covered |
| New focused tests | 6 passed |
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
- delivery state in the GSD workstream under `/home/marce/.planning/`.

## Friction and adjustments

- GSD tasks and Spec Kit tasks can overlap. The adopted rule is that Spec Kit
  tasks describe feature traceability while GSD records execution and
  continuity; neither copies the other's narrative.
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
integrations or significant non-functional requirements. Continue using a
small GSD-only plan for localized maintenance with no behavioral or
architectural effect. Create ADRs only for durable cross-feature choices.

Do not add a multiagent framework, MCP, RAG or vector database at this stage.

