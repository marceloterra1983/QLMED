# Implementation Plan: AI tooling auto-refresh and mandatory use

**Status:** Approved for repository governance; no runtime or deploy effect.

## Sequence

1. Add always-on Cursor rules and session/post-edit hooks.
2. Expose existing Spec Kit skills and the Graphify skill to Cursor.
3. Add the fail-closed checker, fixture test and CI jobs.
4. Add weekly drift detection that opens or updates an issue.
5. Upgrade the Graphify CLI at the start of the host refresh.

## Constitution gates

- Work only in the isolated `feat/009-ai-tooling-auto` worktree.
- Read no `.env` file and perform no deploy, migration or production action.
- Do not force-upgrade Spec Kit integration on `main`.
- Keep SPEC-003 pin `0.14.2` unchanged.

## Traceability

| Requirement / AC | Implementation | Evidence |
|---|---|---|
| FR-002, AC-001–AC-003 | `.cursor/rules/*`, `.cursor/hooks.json`, `.cursor/skills/*` | `npm run ai-tooling:check` |
| FR-003, AC-007/AC-008 | `scripts/check-ai-tooling.mjs`, CI docs/app | `npm run ai-tooling:check:test` |
| FR-001, FR-005, AC-005/AC-006 | unchanged pin + drift workflow | pin triple match + workflow file |
| FR-004, AC-004 | `~/ops/scripts/graphify-refresh.sh` | script contains CLI upgrade |
| NFR-001/NFR-002 | checker/hooks ignore `.env`; graph stays gitignored | review of the added files |
