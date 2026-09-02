import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
  syncLogUpdate: vi.fn(),
  pgConnect: vi.fn(),
  pgQuery: vi.fn(),
  pgEnd: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.transaction,
    syncLog: { update: mocks.syncLogUpdate },
  },
}));

vi.mock('@/lib/database-config', () => ({
  getCanonicalDatabaseUrl: () => 'postgres://localhost/fake',
}));

vi.mock('pg', () => ({
  Client: class {
    connect = mocks.pgConnect;
    query = mocks.pgQuery;
    end = mocks.pgEnd;
  },
}));

import {
  beginSyncRun,
  createSyncLogIfIdle,
  syncExecutionLockKey,
  syncLogLockKey,
} from '@/lib/postgres-advisory-lock';

describe('sync advisory lock', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $queryRaw: mocks.queryRaw,
      syncLog: {
        findFirst: mocks.findFirst,
        create: mocks.create,
      },
    }));
    mocks.queryRaw.mockResolvedValue([]);
  });

  it('uses a stable company-specific lock key', () => {
    expect(syncLogLockKey('company-1')).toBe('sync-log-start:company-1');
  });

  it('returns null when another sync is already running', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'running-1' });

    await expect(createSyncLogIfIdle('company-1', 'nsdocs')).resolves.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('creates the running log while holding the transaction lock', async () => {
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'sync-1' });

    await expect(createSyncLogIfIdle('company-1', 'sefaz')).resolves.toEqual({ id: 'sync-1' });
    expect(mocks.queryRaw).toHaveBeenCalled();
    expect(mocks.create).toHaveBeenCalledWith({
      data: { companyId: 'company-1', syncMethod: 'sefaz', status: 'running' },
      select: { id: true },
    });
  });
});

// FISCAL-008: a linha 'running' sobrevive à morte do processo; o lock de sessão
// não. Por isso o portão de execução são os dois juntos.
describe('beginSyncRun — portão de execução com liveness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $queryRaw: mocks.queryRaw,
      syncLog: { findFirst: mocks.findFirst, create: mocks.create },
    }));
    mocks.queryRaw.mockResolvedValue([]);
    mocks.findFirst.mockResolvedValue(null);
    mocks.create.mockResolvedValue({ id: 'sync-1' });
    mocks.syncLogUpdate.mockResolvedValue({});
  });

  it('usa uma chave de lock estável e distinta da chave de criação do log', () => {
    expect(syncExecutionLockKey('company-1')).toBe('sync-execution:company-1');
    expect(syncExecutionLockKey('company-1')).not.toBe(syncLogLockKey('company-1'));
  });

  it('devolve o handle quando o lock é concedido', async () => {
    mocks.pgQuery.mockResolvedValue({ rows: [{ acquired: true }] });

    const run = await beginSyncRun('company-1', 'sefaz');

    expect(run.syncLogId).toBe('sync-1');
    expect(mocks.pgQuery).toHaveBeenCalledWith(
      'SELECT pg_try_advisory_lock(hashtext($1)::bigint) AS acquired',
      ['sync-execution:company-1'],
    );

    await run.release();
    expect(mocks.pgQuery).toHaveBeenLastCalledWith(
      'SELECT pg_advisory_unlock(hashtext($1)::bigint)',
      ['sync-execution:company-1'],
    );
    expect(mocks.pgEnd).toHaveBeenCalled();
  });

  it('recusa a corrida e fecha o log herdado quando outro processo detém o lock', async () => {
    mocks.pgQuery.mockResolvedValue({ rows: [{ acquired: false }] });

    await expect(beginSyncRun('company-1', 'nsdocs', 'sync-log-herdado')).rejects.toThrow('SYNC_ALREADY_RUNNING');

    // Sem isto o log herdado ficava 'running' para sempre, bloqueando os
    // próximos ciclos com um sync que nunca chegou a correr.
    expect(mocks.syncLogUpdate).toHaveBeenCalledWith({
      where: { id: 'sync-log-herdado' },
      data: expect.objectContaining({ status: 'error' }),
    });
  });
});
