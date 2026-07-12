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

The exact schema is intentionally not reproduced here; consult
`prisma/schema.prisma` and the ordered migration history.

