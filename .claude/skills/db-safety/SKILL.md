---
name: db-safety
description: Database safety rules for QLMED — prevent destructive operations, enforce versioned Prisma migrations, backup reminders
---

# Database Safety for QLMED

## When to activate
Activate when working with Prisma schema changes, database migrations, SQL queries, or any operation that modifies the database structure or data.

## Critical rules

### NEVER do these
1. **NEVER run `prisma db push`** against the canonical database (`postgres` via `DATABASE_URL`). Schema source of truth is versioned migrations under `prisma/migrations/`.
2. **NEVER run `prisma migrate dev`** against the canonical database. Dev and production share that instance; `migrate dev` can reset data and diverge from production history. ADR-0007: use CI ephemeral replay and versioned migration gates instead.
3. **NEVER run `prisma migrate reset`** — drops and recreates the database; all production data would be lost.
4. **NEVER run `prisma migrate deploy`** against the canonical/production database without explicit human authorization and a current backup receipt.
5. **NEVER run raw `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, or `ALTER TABLE DROP COLUMN`** without explicit user confirmation.
6. **NEVER introduce runtime DDL** — Constitution Principle III; runtime DDL is legacy and must not return.

### ALWAYS do these
1. **Use versioned Prisma migrations** for schema changes — edit `prisma/schema.prisma` and add an ordered migration under `prisma/migrations/`.
2. **Warn the user before any schema change** — explain what will change, expand/contract compatibility, and whether data could be lost.
3. **Check for destructive changes** before authoring a migration:
   - Removing a field → data in that column is lost
   - Changing a field type → may fail if data can't be converted
   - Removing a model → table and all data is dropped
   - Adding a required field without default → fails if table has rows
4. **Run migration gates** after schema/migration work (CI / disposable `qlmed_ci` only):
   ```bash
   npm run db:migrate:verify
   npm run db:reconcile:verify
   ```
5. **Suggest a backup** before destructive schema changes or any human-gated deploy:
   ```bash
   docker exec <qlmed-db-container> pg_dump -U postgres postgres | gzip > ~/QLMED/backups/pre-change-$(date +%Y%m%d-%H%M%S).sql.gz
   ```

### Safe workflow for schema changes
1. Edit `prisma/schema.prisma`
2. Author a versioned migration under `prisma/migrations/` (non-destructive / expand-first when production data is involved)
3. Run `npx prisma validate` to check syntax
4. Confirm impact with the user (compatibility with previous app image; expand/contract if needed)
5. Prove replay and drift on disposable CI DB only — **do not** apply to the canonical DB from an agent session:
   ```bash
   npm run db:migrate:verify
   npm run db:reconcile:verify
   ```
6. Run `npx prisma generate` to update the client
7. Production apply is human-gated: `prisma migrate deploy` runs via deploy/`start.sh` only after explicit approval; image rollback does not reverse a successful migration

### Database connection
- Canonical persistent DB name: `postgres` (only via `DATABASE_URL`)
- CI disposable DB: `qlmed_ci` (destroyed after the job; not a second persistent environment)
- `qlmed_dev` and parallel URL aliases are not supported (ADR-0007)
- Dev may connect to the canonical instance only with protected credentials, background services disabled, and a current backup receipt
- Production connects via Docker network to the same canonical PostgreSQL

### Querying safely
- Prefer Prisma client queries over raw SQL
- For raw SQL, always use `SELECT` first to verify scope before `UPDATE`/`DELETE`
- Always include `WHERE` clauses — no bare `UPDATE` or `DELETE`
- Use `LIMIT` on exploratory queries
