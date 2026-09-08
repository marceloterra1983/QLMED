import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  createMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    stockMovement: {
      findMany: mocks.findMany,
      createMany: mocks.createMany,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { recordCancellationEstorno } from '@/lib/stock-ledger-estorno';

const CANCELLED_AT = new Date('2026-09-07T12:00:00.000Z');

const ORIGINAL_IN = {
  id: 'mv-1',
  productCodigo: 'P1',
  productName: 'Produto 1',
  lot: 'L1',
  lotExpiry: '2027-01-31',
  lotSerial: null,
  quantity: 10,
  direction: 'IN',
  locationType: 'CD',
  locationCnpj: null,
  locationName: null,
  transferGroupId: null,
};

describe('recordCancellationEstorno (BUG-001)', () => {
  beforeEach(() => {
    mocks.findMany.mockReset().mockResolvedValue([]);
    mocks.createMany.mockReset().mockResolvedValue({ count: 0 });
  });

  it('gera movimento compensatório append-only (IN→OUT, mesma localização/lote)', async () => {
    mocks.findMany.mockResolvedValue([ORIGINAL_IN]);
    mocks.createMany.mockResolvedValue({ count: 1 });

    const n = await recordCancellationEstorno('company-1', 'inv-1', CANCELLED_AT);

    expect(n).toBe(1);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          companyId: 'company-1',
          invoiceId: 'inv-1',
        }),
      }),
    );
    const row = mocks.createMany.mock.calls[0][0].data[0];
    expect(row).toMatchObject({
      direction: 'OUT',
      kind: 'ESTORNO_CANCELAGEM',
      productCodigo: 'P1',
      lot: 'L1',
      lotExpiry: '2027-01-31',
      locationType: 'CD',
      quantity: 10,
      invoiceId: 'inv-1',
      occurredAt: CANCELLED_AT,
      idempotencyKey: 'estorno:mv-1',
    });
    // Append-only: dedupe no banco pela chave estável, nunca update/delete.
    expect(mocks.createMany.mock.calls[0][0].skipDuplicates).toBe(true);
  });

  it('OUT original volta como IN (estorno simétrico)', async () => {
    mocks.findMany.mockResolvedValue([{ ...ORIGINAL_IN, id: 'mv-2', direction: 'OUT', locationType: 'CUSTOMER', locationCnpj: '12345678000199' }]);
    mocks.createMany.mockResolvedValue({ count: 1 });

    await recordCancellationEstorno('company-1', 'inv-1', CANCELLED_AT);

    const row = mocks.createMany.mock.calls[0][0].data[0];
    expect(row.direction).toBe('IN');
    expect(row.locationType).toBe('CUSTOMER');
    expect(row.locationCnpj).toBe('12345678000199');
    expect(row.idempotencyKey).toBe('estorno:mv-2');
  });

  it('não cria nada quando a nota não tem movimentos fiscais', async () => {
    const n = await recordCancellationEstorno('company-1', 'inv-1', CANCELLED_AT);
    expect(n).toBe(0);
    expect(mocks.createMany).not.toHaveBeenCalled();
  });

  it('exclui estornos pré-existentes da varredura (chave not startsWith estorno:)', async () => {
    await recordCancellationEstorno('company-1', 'inv-1', CANCELLED_AT);
    expect(mocks.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          idempotencyKey: { not: { startsWith: 'estorno:' } },
        }),
      }),
    );
  });

  it('falha de banco loga e não propaga (mesmo contrato dos hooks do ledger)', async () => {
    mocks.findMany.mockResolvedValue([ORIGINAL_IN]);
    mocks.createMany.mockRejectedValue(new Error('db down'));
    await expect(recordCancellationEstorno('company-1', 'inv-1', CANCELLED_AT)).resolves.toBe(0);
  });
});