---
name: db-safety
description: Database safety rules for QLMED — prevent destructive operations, enforce versioned migrations, verification and backup reminders
---

# Database Safety for QLMED

## When to activate
Activate when working with Prisma schema changes, database migrations, SQL queries, or any operation that modifies the database structure or data.

## Critical rules

### NEVER do these
1. **NEVER run `prisma migrate reset`** — This drops and recreates the database. ALL persistent data would be lost.
2. **NEVER run `prisma migrate dev` against the persistent canonical database** — migration generation and replay must use a disposable, explicitly authorized environment; the canonical database is not a development target.
3. **NEVER run raw `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, or `ALTER TABLE DROP COLUMN`** without explicit user confirmation and an approved recovery plan.
4. **NEVER modify `prisma/schema.prisma` without a corresponding reviewed migration file** in `prisma/migrations/`.

### ALWAYS do these
1. **Use ordered Prisma migrations** for every durable schema change. The schema and `prisma/migrations/` are the database source of truth; do not apply schema changes through an unversioned shortcut.
2. **Warn the user before any schema change** — explain what will change and if any data could be lost.
3. **Check for destructive or incompatible changes** before creating or applying a migration:
   - Removing a field → data in that column is lost
   - Changing a field type → may fail if data can't be converted
   - Removing a model → table and all data is dropped
   - Adding a required field without default → fails if table has rows
4. **Use expand/contract** for incompatible changes so the current and rollback application versions remain compatible during the observation window.
5. **Verify migration history and drift** with `npm run db:migrate:verify` and, when the change affects reconciliation, `npm run db:reconcile:verify` in the disposable CI database.
6. **Require the current `server-backup` receipt and explicit operational authorization** before work that can alter the persistent canonical database. Never print credentials or backup contents.

### Safe workflow for schema changes
1. Edit `prisma/schema.prisma`
2. Run `npx prisma validate` to check syntax
3. Generate and review an ordered migration in a disposable, authorized PostgreSQL environment; do not target the persistent canonical database during development.
4. Review the migration SQL for destructive operations, data preservation, compatibility and rollback consequences.
5. Confirm the migration plan with the user before any persistent-database operation.
6. Run `npm run db:migrate:verify` and `npm run db:reconcile:verify` in CI as applicable.
7. Run `npx prisma generate` and the relevant application checks after the migration is accepted.

### Database connection
- The persistent runtime uses only the protected `DATABASE_URL` targeting the canonical `postgres` database.
- CI may use only the disposable `qlmed_ci` database for migration replay and tests.
- Do not create or assume `qlmed_dev`, arbitrary database names or parallel database URL aliases.
- Never print `DATABASE_URL` or any credential while validating configuration or migrations.

### Querying safely
- Prefer Prisma client queries over raw SQL
- For raw SQL, always use `SELECT` first to verify scope before `UPDATE`/`DELETE`
- Always include `WHERE` clauses — no bare `UPDATE` or `DELETE`
- Use `LIMIT` on exploratory queries
