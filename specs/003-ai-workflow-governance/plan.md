# Implementation Plan: AI workflow governance

**Status:** Approved for repository governance; no runtime effect is authorized.

## Sequence

1. Declare the project capability contract and the exact Spec Kit pin.
2. Make `AGENTS.md` canonical and keep `CLAUDE.md` as a thin adapter.
3. Keep the repository in the declared Spec Kit-only profile with GSD disabled.
4. Validate that versioned local capabilities remain limited to `.agents/skills` and `.claude/skills`, without repository-local GSD materialization or a GSD lock.
5. Validate documentation, manifest schema and workspace drift.

## Constitution gates

- Work only in the isolated governance worktree.
- Read no `.env` file and perform no deploy, migration or production action.
- Preserve Spec Kit as the source of behavioral authority.
- Treat GSD as optional execution continuity, never as authorization.

## Traceability

| Requirement / AC | Implementation | Evidence |
|---|---|---|
| FR-001/FR-002, AC-001/AC-002 | `governance.yaml`, `AGENTS.md`, `CLAUDE.md` | docs validator and server schema audit |
| FR-003/NFR-002, AC-003/AC-004 | `governance.yaml` with `gsd.mode: disabled` and `capability_profile: speckit-only`; versioned `.agents/skills` and `.claude/skills` | governance assertions and workspace drift audit |
| FR-004–FR-006, AC-005/AC-006 | agent policy, GSD config and state reconciliation | configuration assertions and clean status |
| NFR-001/NFR-003 | redacted evidence and server snapshot reference | server governance final report |
