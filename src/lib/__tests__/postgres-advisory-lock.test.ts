import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  findFirst: vi.fn(),
  create: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: mocks.transaction,
  },
}));

import {
  createSyncLogIfIdle,
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
