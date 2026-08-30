import { Client } from 'pg';
import type { Prisma } from '@prisma/client';
import { getCanonicalDatabaseUrl } from '@/lib/database-config';
import prisma from './prisma';

export interface PostgresAdvisoryLock {
  release(): Promise<void>;
}

export function productAggregateLockKey(companyId: string): string {
  return `product-aggregate-rebuild:${companyId}`;
}

export function syncLogLockKey(companyId: string): string {
  return `sync-log-start:${companyId}`;
}

export function impcgMailIngestLockKey(companyId: string): string {
  return `impcg-mail-ingest:${companyId}`;
}

export function cassemsMailIngestLockKey(companyId: string): string {
  return `cassems-mail-ingest:${companyId}`;
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

export type SyncMethod = 'sefaz' | 'nsdocs' | 'receita_nfse';

/** Atomically refuse a second sync for the same company. */
export async function createSyncLogIfIdle(
  companyId: string,
  syncMethod: SyncMethod,
): Promise<{ id: string } | null> {
  return prisma.$transaction(async (tx) => {
    await acquirePostgresTransactionAdvisoryLock(tx, syncLogLockKey(companyId));
    const running = await tx.syncLog.findFirst({
      where: { companyId, status: 'running' },
      select: { id: true },
    });
    if (running) return null;
    return tx.syncLog.create({
      data: { companyId, syncMethod, status: 'running' },
      select: { id: true },
    });
  });
}

export async function acquirePostgresAdvisoryLock(
  key: string,
  options: { wait?: boolean } = {},
): Promise<PostgresAdvisoryLock | null> {
  const connectionString = getCanonicalDatabaseUrl();

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
