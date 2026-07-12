# Architectural boundaries

## Authentication and authorization

Protected server routes obtain the current identity through the canonical auth
helpers. Roles are `admin`, `editor` and `viewer`. Mutating operations must
enforce their required role on the server.

## Company isolation

QLMED currently operates in single-company mode. Company context is resolved
from the authenticated identity through `src/lib/single-company.ts`. A client
supplied `companyId` must not be trusted to broaden access.

## Data access

Prisma schema and migrations are the database source of truth. New tables or
columns require a migration and migration verification. Raw SQL is reserved for
cases Prisma cannot express adequately and must remain parameterized.

## Integrations

Integration clients and strategies belong in `src/lib`. HTTP routes should not
duplicate protocol logic. Credentials are read from protected configuration,
decrypted only where required, and excluded from logs.

## Background work

Schedulers decide when work runs; strategies implement how each integration
runs. A strategy must be callable independently of its scheduler so it can be
tested without starting background loops.

## Dependency direction

```text
UI/HTTP adapters -> application/domain modules -> persistence/integration ports
```

Shared domain behavior must not import pages or HTTP route handlers. Tests may
exercise route adapters, but core behavior should remain testable in isolation.

