import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client-runtime-utils';

const mocks = vi.hoisted(() => ({
  duplicataFindMany: vi.fn(),
  invoiceFindMany: vi.fn(),
  invoiceAggregate: vi.fn(),
  invoiceCount: vi.fn(),
  duplicataGroupBy: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.invoiceFindMany,
      aggregate: mocks.invoiceAggregate,
      count: mocks.invoiceCount,
    },
    invoiceDuplicata: {
      findMany: mocks.duplicataFindMany,
      groupBy: mocks.duplicataGroupBy,
    },
  },
}));

vi.mock('@/lib/invoice-duplicata-store', () => ({
  backfillInvoiceDuplicatas: vi.fn(),
}));

describe('G7 — Relational duplicatas query without massive IN(IDs) array', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete (globalThis as Record<string, unknown>).financeiroDuplicatasCache;
    delete (globalThis as Record<string, unknown>).financeiroDuplicatasInFlight;

    mocks.invoiceAggregate.mockResolvedValue({
      _count: { _all: 1 },
      _max: { createdAt: new Date() },
      _sum: { totalValue: new Decimal('100.00') },
    });
    mocks.invoiceCount.mockResolvedValue(1);
    mocks.duplicataGroupBy.mockResolvedValue([{ invoiceId: 'inv-1', _count: 1 }]);
  });

  it('queries invoiceDuplicata with relational where.invoice filter and include, without passing invoiceId in list', async () => {
    mocks.duplicataFindMany.mockResolvedValue([
      {
        invoiceId: 'inv-1',
        dupNumero: '001',
        dupVencimento: '2026-10-15',
        dupValor: 100,
        dupValorDecimal: new Decimal('100.00'),
        faturaNumero: 'FAT-1',
        faturaValorOriginal: 100,
        faturaValorOriginalDecimal: new Decimal('100.00'),
        faturaValorLiquido: 100,
        faturaValorLiquidoDecimal: new Decimal('100.00'),
        invoice: {
          id: 'inv-1',
          accessKey: '35260100000000000000550010000000011000000010',
          number: '1',
          senderCnpj: '07832309000197',
          senderName: 'QL MED',
          recipientCnpj: '12345678000199',
          recipientName: 'Hospital São Lucas',
          issueDate: new Date('2026-09-01T12:00:00Z'),
          totalValue: new Decimal('100.00'),
          cfop: '5102',
        },
      },
    ]);

    const { getFinanceiroDuplicatas } = await import('../financeiro-duplicatas');
    const result = await getFinanceiroDuplicatas('comp-1', 'issued');

    expect(result).toHaveLength(1);
    expect(result[0].nfNumero).toBe('1');
    expect(result[0].partyNome).toBe('Hospital São Lucas');
    expect(result[0].dupValor).toBe(100);

    // Verify duplicataFindMany call parameters:
    expect(mocks.duplicataFindMany).toHaveBeenCalled();
    const callArgs = mocks.duplicataFindMany.mock.calls[0][0];

    // CRITICAL: Must not have passed invoiceId: { in: [...] }
    expect(callArgs.where.invoiceId).toBeUndefined();

    // Must have used relational invoice filter
    expect(callArgs.where.invoice).toBeDefined();
    expect(callArgs.where.invoice.type).toBe('NFE');
    expect(callArgs.where.invoice.direction).toBe('issued');

    // Must have used include for the invoice relation
    expect(callArgs.include?.invoice).toBeDefined();
  });
});
