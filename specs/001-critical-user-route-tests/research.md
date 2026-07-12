# Research: route-test pilot

## Evidence

- The repository contains many mutating routes but only a small number of
  direct route-handler tests.
- `PATCH /api/users/:id` performs admin authorization, self-protection, session
  invalidation and audit attribution in one security-critical path.
- Existing tests use Vitest hoisted mocks and import route handlers directly,
  providing an established pattern without new dependencies.

## Decision

Test the existing handler directly and do not refactor production code during
the pilot. This isolates evaluation of the Spec Kit workflow from code-change
risk.

