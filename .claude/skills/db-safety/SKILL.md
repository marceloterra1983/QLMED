---
name: db-safety
description: Database safety rules for QLMED — prevent destructive operations, enforce db push workflow, backup reminders
---

# Database Safety for QLMED

## When to activate
Activate when working with Prisma schema changes, database migrations, SQL queries, or any operation that modifies the database structure or data.

## Critical rules

### NEVER do these
1. **NEVER run `prisma migrate dev`** — Dev and production share the same database. `migrate dev` resets data and creates migration files that don't match the production state.
2. **NEVER run `prisma migrate reset`** — This drops and recreates the database. ALL production data would be lost.
3. **NEVER run raw `DROP TABLE`, `DROP DATABASE`, `TRUNCATE`, or `ALTER TABLE DROP COLUMN`** without explicit user confirmation.
4. **NEVER modify `prisma/schema.prisma` without warning the user** that `db push` will be needed and explaining the impact.

### ALWAYS do these
1. **Use `prisma db push`** for schema changes — it applies changes without creating migration files.
2. **Warn the user before any schema change** — explain what will change and if any data could be lost.
3. **Check for destructive changes** before `db push`:
   - Removing a field → data in that column is lost
   - Changing a field type → may fail if data can't be converted
   - Removing a model → table and all data is dropped
   - Adding a required field without default → fails if table has rows
4. **Suggest a backup** before destructive schema changes:
   ```bash
   docker exec <qlmed-db-container> pg_dump -U postgres postgres | gzip > ~/QLMED/backups/pre-change-$(date +%Y%m%d-%H%M%S).sql.gz
   ```

### Safe workflow for schema changes
1. Edit `prisma/schema.prisma`
2. Run `npx prisma validate` to check syntax
3. Run `npx prisma db push --dry-run` to preview changes (if available)
4. Confirm with user
5. Run `npx prisma db push`
6. Run `npx prisma generate` to update the client

### Database connection
- Dev connects via socat proxy: `postgresql://postgres:PASSWORD@127.0.0.1:5432/postgres`
- Production connects via Docker network: `postgresql://postgres:PASSWORD@qlmed-db:5432/postgres`
- Both point to the SAME PostgreSQL instance

### Querying safely
- Prefer Prisma client queries over raw SQL
- For raw SQL, always use `SELECT` first to verify scope before `UPDATE`/`DELETE`
- Always include `WHERE` clauses — no bare `UPDATE` or `DELETE`
- Use `LIMIT` on exploratory queries
