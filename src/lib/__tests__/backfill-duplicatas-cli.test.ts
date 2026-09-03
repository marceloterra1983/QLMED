import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  extractAndStoreDuplicatas: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.findMany,
    },
  },
}));

vi.mock('@/lib/invoice-duplicata-store', () => ({
  extractAndStoreDuplicatas: mocks.extractAndStoreDuplicatas,
}));

import { runBackfillDuplicatas } from '../../../scripts/backfill-all-duplicatas';

describe('G6 — CLI script for durable duplicatas backfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('iterates through batches until all pending invoices without duplicatas are processed', async () => {
    // Batch 1 returns 2 invoices, Batch 2 returns empty (completed)
    mocks.findMany
      .mockResolvedValueOnce([
        { id: 'inv-1', companyId: 'comp-1', xmlContent: '<xml1 />', number: '101' },
        { id: 'inv-2', companyId: 'comp-1', xmlContent: '<xml2 />', number: '102' },
      ])
      .mockResolvedValueOnce([]);

    const summary = await runBackfillDuplicatas({
      batchSize: 2,
      companyId: 'comp-1',
    });

    expect(summary.totalProcessed).toBe(2);
    expect(summary.completed).toBe(true);
    expect(mocks.extractAndStoreDuplicatas).toHaveBeenCalledTimes(2);
    expect(mocks.extractAndStoreDuplicatas).toHaveBeenCalledWith('inv-1', 'comp-1', '<xml1 />');
    expect(mocks.extractAndStoreDuplicatas).toHaveBeenCalledWith('inv-2', 'comp-1', '<xml2 />');

    // Query must filter invoices with duplicatas: { none: {} }
    const firstCallWhere = mocks.findMany.mock.calls[0][0].where;
    expect(firstCallWhere.duplicatas).toEqual({ none: {} });
    expect(firstCallWhere.type).toBe('NFE');
  });

  it('does not invoke extractAndStoreDuplicatas in dryRun mode', async () => {
    mocks.findMany.mockResolvedValueOnce([
      { id: 'inv-1', companyId: 'comp-1', xmlContent: '<xml1 />', number: '101' },
    ]);

    const summary = await runBackfillDuplicatas({
      batchSize: 10,
      dryRun: true,
    });

    expect(summary.totalProcessed).toBe(1);
    expect(mocks.extractAndStoreDuplicatas).not.toHaveBeenCalled();
  });

  it('stops when maxBatches limit is reached', async () => {
    mocks.findMany.mockResolvedValue([
      { id: 'inv-1', companyId: 'comp-1', xmlContent: '<xml1 />', number: '101' },
      { id: 'inv-2', companyId: 'comp-1', xmlContent: '<xml2 />', number: '102' },
    ]);

    const summary = await runBackfillDuplicatas({
      batchSize: 2,
      maxBatches: 1,
    });

    expect(summary.batchCount).toBe(1);
    expect(summary.totalProcessed).toBe(2);
    expect(summary.completed).toBe(false);
  });
});
