import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  movementDeleteMany: vi.fn().mockResolvedValue({ count: 0 }),
  itemFindMany: vi.fn().mockResolvedValue([]),
  movementCreateMany: vi.fn().mockResolvedValue({ count: 0 }),
  movementFindFirst: vi.fn().mockReturnValue(null),
  movementUpdate: vi.fn().mockResolvedValue({}),
  movementDelete: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    stockMovement: {
      deleteMany: mocks.movementDeleteMany,
      createMany: mocks.movementCreateMany,
      findFirst: mocks.movementFindFirst,
      update: mocks.movementUpdate,
      delete: mocks.movementDelete,
    },
    nfeEntryItem: {
      findMany: mocks.itemFindMany,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { recordMovementsFromEntryItems, syncEntryItemMovement } from '@/lib/stock-ledger';

function item(over: Record<string, unknown> = {}) {
  return {
    id: 101,
    itemNumber: 1,
    codigoInterno: 'COD-1',
    supplierCode: 'SUP-1',
    productName: 'Produto 1',
    supplierDescription: 'Desc fornecedor',
    registryId: 'reg-1',
    lot: 'L1',
    lotExpiry: '2027-01-31',
    lotSerial: null,
    quantity: 10,
    lotQuantity: null,
    ...over,
  };
}

describe('recordMovementsFromEntryItems — replaceExisting (BUG-002)', () => {
  beforeEach(() => {
    mocks.movementDeleteMany.mockClear().mockResolvedValue({ count: 0 });
    mocks.itemFindMany.mockClear().mockResolvedValue([]);
    mocks.movementCreateMany.mockClear().mockResolvedValue({ count: 0 });
  });

  it('limpa os movimentos entrada-item: da invoice antes de regravar', async () => {
    mocks.itemFindMany.mockResolvedValue([item()]);
    mocks.movementCreateMany.mockResolvedValue({ count: 1 });

    await recordMovementsFromEntryItems('company-1', 'inv-1', new Date(), 'user-1', {
      replaceExisting: true,
    });

    expect(mocks.movementDeleteMany).toHaveBeenCalledWith({
      where: {
        companyId: 'company-1',
        invoiceId: 'inv-1',
        kind: 'ENTRADA_NFE',
        idempotencyKey: { startsWith: 'entrada-item:' },
      },
    });
    expect(mocks.movementCreateMany).toHaveBeenCalledTimes(1);
    const row = mocks.movementCreateMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      idempotencyKey: 'entrada-item:101',
      kind: 'ENTRADA_NFE',
      direction: 'IN',
      quantity: 10,
      nfeEntryItemId: 101,
    });
  });

  it('sem replaceExisting não toca no deleteMany (comportamento original preservado)', async () => {
    mocks.itemFindMany.mockResolvedValue([item()]);
    await recordMovementsFromEntryItems('company-1', 'inv-1', new Date(), 'user-1');
    expect(mocks.movementDeleteMany).not.toHaveBeenCalled();
  });

  it('item sem quantidade não gera movimento', async () => {
    mocks.itemFindMany.mockResolvedValue([item({ quantity: 0, lotQuantity: null })]);
    const n = await recordMovementsFromEntryItems('company-1', 'inv-1', new Date(), 'user-1', {
      replaceExisting: true,
    });
    expect(n).toBe(0);
    expect(mocks.movementCreateMany).not.toHaveBeenCalled();
  });
});

describe('syncEntryItemMovement (BUG-002 — espelho de PATCH/clone/delete de lote)', () => {
  beforeEach(() => {
    mocks.movementFindFirst.mockClear().mockReturnValue(null);
    mocks.movementUpdate.mockClear().mockResolvedValue({});
    mocks.movementDelete.mockClear().mockResolvedValue({});
    mocks.movementCreateMany.mockClear().mockResolvedValue({ count: 0 });
  });

  it('cria movimento quando não existe', async () => {
    mocks.movementCreateMany.mockResolvedValue({ count: 1 });
    const r = await syncEntryItemMovement('company-1', 'inv-1', item());
    expect(r).toBe('created');
    const row = mocks.movementCreateMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      idempotencyKey: 'entrada-item:101',
      kind: 'ENTRADA_NFE',
      direction: 'IN',
      quantity: 10,
      nfeEntryItemId: 101,
    });
  });

  it('atualiza lote preservando occurredAt/createdBy quando já existe', async () => {
    const occurredAt = new Date('2026-01-15T10:00:00.000Z');
    mocks.movementFindFirst.mockReturnValue({ id: 'mv-9', occurredAt, createdBy: 'user-original' });
    const r = await syncEntryItemMovement('company-1', 'inv-1', item({ lot: 'L2' }));
    expect(r).toBe('updated');
    expect(mocks.movementUpdate).toHaveBeenCalledWith({
      where: { id: 'mv-9' },
      data: expect.objectContaining({ lot: 'L2', quantity: 10 }),
    });
    expect(mocks.movementCreateMany).not.toHaveBeenCalled();
  });

  it('remove o movimento quando a quantidade vai a zero', async () => {
    mocks.movementFindFirst.mockReturnValue({ id: 'mv-9', occurredAt: new Date(), createdBy: null });
    const r = await syncEntryItemMovement('company-1', 'inv-1', item({ lotQuantity: 0 }));
    expect(r).toBe('removed');
    expect(mocks.movementDelete).toHaveBeenCalledWith({ where: { id: 'mv-9' } });
  });

  it('noop quando quantidade zero e nada a remover', async () => {
    const r = await syncEntryItemMovement('company-1', 'inv-1', item({ lotQuantity: 0 }));
    expect(r).toBe('noop');
    expect(mocks.movementDelete).not.toHaveBeenCalled();
  });
});