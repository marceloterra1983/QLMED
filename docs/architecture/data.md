# Data architecture

PostgreSQL is the durable system of record and Prisma is the canonical schema.
Core records include users, companies, fiscal invoices/documents, contacts,
products, inventory and financial data.

## Rules

- Every company-owned record must retain its company boundary.
- Fiscal access keys and other natural identifiers must respect the uniqueness
  constraints defined by the schema.
- Migrations follow expand/contract when compatibility across releases matters.
- An application rollback does not automatically reverse a database migration.
- Tests and development use non-production databases.
- Fiscal XML may contain sensitive business data and must not be logged in full.
- A derived or shadow table extracted from existing records must ship with a
  backfill wired to run automatically (lazily on first access or via a
  dedicated endpoint), and be validated at production data volume. Creating
  the table only populates future ingestions; existing rows stay uncovered
  (seen twice: `invoice_item_tax` at 323/1421 coverage, `invoice_duplicata`
  empty and blanking contas a pagar/receber until
  `getFinanceiroDuplicatas` gained a lazy backfill).

## Prisma 7 runtime

Prisma 7 removed the built-in engine; every client needs a driver adapter
(`PrismaPg`). Consequences that have each broken a deploy at least once:

- `src/lib/prisma.ts` wraps the client in a lazy `Proxy` — the adapter needs
  `DATABASE_URL`, which does not exist during the Docker build stage.
- `prisma.config.ts` provides a placeholder URL fallback for build.
- The `prisma` package lives in `dependencies` (not `devDependencies`)
  because the container entrypoint runs `prisma migrate deploy`.
- The Docker runner stage copies the full `node_modules` — the Prisma 7 CLI
  pulls transitive deps (`effect`, `fast-check`, `c12`, `pathe`, …) that make
  cherry-picking impractical.

The exact schema is intentionally not reproduced here; consult
`prisma/schema.prisma` and the ordered migration history.

