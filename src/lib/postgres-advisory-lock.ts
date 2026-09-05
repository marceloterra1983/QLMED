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

/**
 * Lock de EXECUÇÃO do sync (sessão, não transação): fica tomado enquanto a
 * corrida está viva e é largado pelo próprio Postgres quando a conexão morre.
 * É por isso que serve de prova de liveness — a linha `running` no SyncLog não
 * serve, porque sobrevive ao processo que a criou.
 */
export function syncExecutionLockKey(companyId: string): string {
  return `sync-execution:${companyId}`;
}

export function impcgMailIngestLockKey(companyId: string): string {
  return `impcg-mail-ingest:${companyId}`;
}

export function cassemsMailIngestLockKey(companyId: string): string {
  return `cassems-mail-ingest:${companyId}`;
}

export function documentosIngestLockKey(companyId: string): string {
  return `documentos-ingest:${companyId}`;
}

export function documentosAlertLockKey(companyId: string): string {
  return `documentos-alert:${companyId}`;
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

export interface SyncRunHandle {
  syncLogId: string;
  release(): Promise<void>;
}

/**
 * Portão único de execução de sync: a linha `running` no SyncLog MAIS o lock de
 * execução. A linha sozinha nunca bastou — sobrevive à morte do processo, e por
 * isso a recuperação por tempo (30 min) tanto matava corrida viva quanto
 * libertava o caminho para uma segunda corrida em paralelo. O lock morre com a
 * conexão, portanto quem o tem está mesmo vivo.
 *
 * Quem chama tem de libertar em `finally`.
 */
export async function beginSyncRun(
  companyId: string,
  syncMethod: SyncMethod,
  existingSyncLogId?: string,
): Promise<SyncRunHandle> {
  const syncLog = existingSyncLogId
    ? { id: existingSyncLogId }
    : await createSyncLogIfIdle(companyId, syncMethod);

  if (!syncLog) throw new Error('SYNC_ALREADY_RUNNING');

  const lock = await acquirePostgresAdvisoryLock(syncExecutionLockKey(companyId));
  if (!lock) {
    // Outro processo está mesmo a sincronizar esta empresa. Fecha o log que já
    // foi criado para não ficar 'running' órfão a bloquear os próximos ciclos.
    try {
      await prisma.syncLog.update({
        where: { id: syncLog.id },
        data: {
          status: 'error',
          errorMessage: 'SYNC_ALREADY_RUNNING: outro processo detém o lock de execução',
          completedAt: new Date(),
        },
      });
    } catch {
      // O log fica para a recuperação por liveness; o importante é não correr.
    }
    throw new Error('SYNC_ALREADY_RUNNING');
  }

  return { syncLogId: syncLog.id, release: () => lock.release() };
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
