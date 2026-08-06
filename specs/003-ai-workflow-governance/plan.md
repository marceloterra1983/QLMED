# Implementation Plan: AI workflow governance

**Status:** Approved for repository governance; no runtime effect is authorized.

## Sequence

1. Declare the project capability contract and exact toolchain pins.
2. Make `AGENTS.md` canonical and keep `CLAUDE.md` as a thin adapter.
3. Reconcile GSD to interactive, non-auto-advancing local operation.
4. Keep GSD `mode: disabled` / `speckit-only`; do not materialize GSD entrypoints
   or a GSD capability lock unless GSD is explicitly re-enabled with a pin.
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
| FR-003/NFR-002, AC-003/AC-004 | `governance.yaml` `gsd.mode: disabled`, `capability_profile: speckit-only` (no GSD lock/entrypoints required) | Toolkit workspace diff / manifest audit |
| FR-004–FR-006, AC-005/AC-006 | agent policy, GSD config and state reconciliation | configuration assertions and clean status |
| NFR-001/NFR-003 | redacted evidence and server snapshot reference | server governance final report |
