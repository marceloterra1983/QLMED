import { Client } from 'pg';
import type { Prisma } from '@prisma/client';

export interface PostgresAdvisoryLock {
  release(): Promise<void>;
}

export function productAggregateLockKey(companyId: string): string {
  return `product-aggregate-rebuild:${companyId}`;
}

export async function acquirePostgresTransactionAdvisoryLock(
  tx: Prisma.TransactionClient,
  key: string,
): Promise<void> {
  await tx.$queryRaw`
    SELECT TRUE AS acquired
    FROM (SELECT pg_advisory_xact_lock(hashtext(${key})::bigint)) AS lock
  `;
}

export async function acquirePostgresAdvisoryLock(
  key: string,
  options: { wait?: boolean } = {},
): Promise<PostgresAdvisoryLock | null> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is required');

  const client = new Client({ connectionString });
  await client.connect();

  try {
    if (options.wait) {
      await client.query('SELECT pg_advisory_lock(hashtext($1)::bigint)', [key]);
    } else {
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS acquired',
        [key],
      );
      if (!result.rows[0]?.acquired) {
        await client.end();
        return null;
      }
    }
  } catch (error) {
    await client.end();
    throw error;
  }

  let released = false;
  return {
    async release() {
      if (released) return;
      released = true;
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1)::bigint)', [key]);
      } finally {
        await client.end();
      }
    },
  };
}
