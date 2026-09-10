import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  deleteMany: vi.fn(),
  createMany: vi.fn(),
  linkFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => {
  const tx = {
    nfeEntryItem: { findMany: mocks.findMany },
    nfeItemProductLink: { findMany: mocks.linkFindMany },
    stockMovement: {
      findFirst: mocks.findFirst,
      deleteMany: mocks.deleteMany,
      createMany: mocks.createMany,
    },
  };
  return {
    default: {
      ...tx,
      $transaction: (fn: (client: typeof tx) => unknown) => fn(tx),
    },
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('recordMovementsFromEntryItems — re-registo', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(null);
    mocks.deleteMany.mockResolvedValue({ count: 2 });
    mocks.createMany.mockResolvedValue({ count: 1 });
    mocks.linkFindMany.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([
      {
        id: 99,
        itemNumber: 1,
        codigoInterno: 'ABC',
        supplierCode: 'ABC',
        productName: null,
        supplierDescription: null,
        registryId: null,
        lot: 'L1',
        lotSerial: null,
        lotExpiry: null,
        lotQuantity: 10,
        quantity: 10,
      },
    ]);
  });

  it('apaga movimentos antigos da nota antes de regravar (sem duplicação)', async () => {
    const { recordMovementsFromEntryItems } = await import('@/lib/stock-ledger');
    await recordMovementsFromEntryItems('c-1', 'inv-1', new Date(), null, {
      replaceExisting: true,
    });

    expect(mocks.deleteMany).toHaveBeenCalledTimes(1);
    expect(mocks.deleteMany).toHaveBeenCalledWith({
      where: {
        companyId: 'c-1',
        invoiceId: 'inv-1',
        kind: 'ENTRADA_NFE',
        idempotencyKey: { startsWith: 'entrada-item:' },
      },
    });
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
    const data = mocks.createMany.mock.calls[0][0].data;
    expect(data).toHaveLength(1);
    expect(data[0].idempotencyKey).toBe('entrada-item:99');
    expect(data[0].quantity).toBe(10);
  });

  it('sem replaceExisting não apaga movimentos', async () => {
    const { recordMovementsFromEntryItems } = await import('@/lib/stock-ledger');
    await recordMovementsFromEntryItems('c-1', 'inv-1', new Date(), null);
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(mocks.createMany).toHaveBeenCalledTimes(1);
  });

  it('dois recortes do mesmo item/lote não colidem na chave', async () => {
    const base = {
      itemNumber: 1,
      codigoInterno: 'ABC',
      supplierCode: 'ABC',
      productName: null,
      supplierDescription: null,
      registryId: null,
      lot: 'L1',
      lotSerial: null,
      lotExpiry: null,
      quantity: 10,
    };
    mocks.findMany.mockResolvedValue([
      { ...base, id: 99, lotQuantity: 4 },
      { ...base, id: 100, lotQuantity: 6 },
    ]);
    const { recordMovementsFromEntryItems } = await import('@/lib/stock-ledger');
    await recordMovementsFromEntryItems('c-1', 'inv-1', new Date(), null, {
      replaceExisting: true,
    });
    const data = mocks.createMany.mock.calls[0][0].data;
    const keys = data.map((row: { idempotencyKey: string }) => row.idempotencyKey);
    expect(keys).toEqual(['entrada-item:99', 'entrada-item:100']);
    expect(new Set(keys).size).toBe(2);
    expect(data.map((row: { quantity: number }) => row.quantity)).toEqual([4, 6]);
  });

  it('backfill received não grava ENTRADA_NFE se a nota já tem entrada-item', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'mov-1' });
    const { recordMovementsFromReceivedInvoice } = await import('@/lib/stock-ledger');
    const n = await recordMovementsFromReceivedInvoice({
      companyId: 'c-1',
      invoiceId: 'inv-1',
      xmlContent: '<nfe/>',
      cfop: '5102',
      senderCnpj: null,
      senderName: null,
      issueDate: new Date('2026-01-01'),
      createdBy: null,
      registryByCode: new Map(),
    });
    expect(n).toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
