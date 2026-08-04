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
- QLMED has one persistent canonical database (`postgres`) configured by
  `DATABASE_URL`; no persistent `qlmed_dev` database, arbitrary database name
  or parallel database URL is supported.
- CI uses a disposable `qlmed_ci` PostgreSQL service for replay and tests. It is
  not part of the runtime data model.
- Local development against the canonical database requires protected
  credentials, `QLMED_DISABLE_BACKGROUND_SERVICES=true`, and a current
  `server-backup` receipt for the `qlmed` set.
- The repository `docker-compose.yml` consumes that protected `DATABASE_URL`
  and deliberately does not provision a second PostgreSQL volume.
- Fiscal XML may contain sensitive business data and must not be logged in full.
- A derived or shadow table extracted from existing records must ship with a
  backfill wired to run automatically (lazily on first access or via a
  dedicated endpoint), and be validated at production data volume. Creating
  the table only populates future ingestions; existing rows stay uncovered
  (histórico pré-backfill, visto em incidentes 2026: `invoice_item_tax` em
  ~323/1421 de cobertura e `invoice_duplicata` vazio blankando contas a
  pagar/receber até `getFinanceiroDuplicatas` ganhar backfill lazy — não
  tratar esses números como estado atual do banco).

## Migration rollout and rollback

Schema changes use an expand/contract sequence so both the current application
and its rollback image can run against the expanded schema:

1. **Expand:** add versioned, non-destructive structures first. New columns are
   nullable or have a safe default, and a new table does not replace a table
   still read by either application revision.
2. **Migrate and observe:** deploy the compatible application, verify migration
   replay and drift, and observe at least one healthy deployment cycle. A store
   may move from legacy runtime DDL/raw CRUD to typed Prisma access only after
   the corresponding versioned table is proven.
3. **Contract:** remove or rename old structures only when neither the running
   image nor the retained `qlmed-app:previous` rollback image depends on them.

The production workflow runs `prisma migrate deploy` and then verifies drift.
Its `Roll back failed deployment` step reverts only the application image; it
does not reverse a migration that already succeeded. Consequently, every
expand migration must remain compatible with the previous image throughout the
observation window. Database rollback is forward-only unless a separate,
reviewed data-recovery procedure explicitly says otherwise.

## Backup contract

The canonical database is the `qlmed` target of the `server-backup` project.
Backup freshness, restoreability and off-site replication are operational
gates, not application settings. Do not create a second database to satisfy a
verification command, and do not place a database URL or backup content in the
repository; application code never reads backup files or backup credentials.

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
