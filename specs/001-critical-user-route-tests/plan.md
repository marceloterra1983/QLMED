# Implementation Plan: Critical user administration route tests

**Branch**: `main` | **Date**: 2026-07-12 | **Spec**: [spec.md](spec.md)

## Summary

Add direct Vitest coverage for the existing `PATCH /api/users/:id` route using
hoisted mocks for authentication, Prisma and logging. No production
implementation change is planned.

## Technical context

**Language/Version**: TypeScript on Node.js 22  
**Primary Dependencies**: Next.js 15, Vitest, Prisma 7  
**Storage**: mocked Prisma interface; no database access  
**Testing**: Vitest route-handler tests  
**Target Platform**: existing Next.js server runtime  
**Project Type**: web application  
**Constraints**: no network, DB, secrets, deployment or production code changes  
**Related ADRs**: N/A  
**Security/Ownership**: mocked `requireAdmin()` supplies the acting identity  
**Rollout/Rollback**: no deploy; rollback is removal of the test and spec  
**Verification**: `npm run docs:validate`, focused Vitest, typecheck, lint,
`npm test`, `npm run build`

## Constitution check

| Gate | Result |
|------|--------|
| Executable evidence | Pass — feature consists of deterministic evidence |
| Server authorization | Pass — tests assert server-side rejection |
| Prisma migration ownership | N/A — no schema change |
| Route/shared module boundary | Pass — production route remains unchanged |
| Secret/fiscal containment | Pass — synthetic IDs and mocked data only |
| Canonical sources | Pass — behavior in spec, execution/traceability in Spec Kit tasks |

## Project structure

```text
specs/001-critical-user-route-tests/
├── spec.md
├── plan.md
├── research.md
├── quickstart.md
└── tasks.md

src/lib/__tests__/
└── users-route.test.ts
```

## Requirement-to-test traceability

| Requirement / AC | Test level | Planned file |
|------------------|------------|--------------|
| FR-001 / AC-001 | route unit | `src/lib/__tests__/users-route.test.ts` |
| FR-002 / AC-002 | route unit | same |
| FR-003 / AC-003, AC-004 | route unit | same |
| FR-004, FR-005 / AC-005 | route unit | same |
| FR-006 / AC-006 | route unit | same |

## Risks

| Risk | Impact | Mitigation | Rollback signal |
|------|--------|------------|-----------------|
| Mock diverges from Prisma surface | False confidence | Assert exact calls and keep mock minimal | Type/test failure after route change |
| Async audit assertion races | Flaky test | Mock resolved promises and flush microtasks | Repeated focused-test failure |
| Test overfits messages | Noisy maintenance | Assert status and security effects primarily | Harmless copy change breaks test |

## Complexity tracking

No constitutional exceptions.

