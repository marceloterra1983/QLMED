import { Prisma } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    nfeEntryItem: { findMany: mocks.findMany },
  },
}));

describe('getNfeEntryItemsByInvoice — sidecar Decimal manda na leitura', () => {
  beforeEach(() => {
    mocks.findMany.mockReset();
  });

  it('usa unitPriceDecimal quando o Float diverge', async () => {
    mocks.findMany.mockResolvedValue([
      {
        id: 1,
        stockEntryId: 'se1',
        companyId: 'c1',
        invoiceId: 'inv1',
        itemNumber: 1,
        supplierCode: null,
        supplierDescription: null,
        ncm: null,
        cfop: null,
        cest: null,
        ean: null,
        anvisa: null,
        unit: null,
        registryId: null,
        codigoInterno: null,
        productName: null,
        manufacturer: null,
        productType: null,
        productSubtype: null,
        quantity: 1,
        unitPrice: 10.009,
        unitPriceDecimal: new Prisma.Decimal('10.01'),
        totalValueGross: 10.009,
        totalValueGrossDecimal: new Prisma.Decimal('10.01'),
        itemDiscount: 0.004,
        itemDiscountDecimal: new Prisma.Decimal('0.00'),
        totalValueNet: 10.009,
        totalValueNetDecimal: new Prisma.Decimal('10.01'),
        origem: null,
        cstIcms: null,
        baseIcms: null,
        aliqIcms: null,
        valorIcms: null,
        baseIcmsSt: null,
        valorIcmsSt: null,
        cstIpi: null,
        aliqIpi: null,
        baseIpi: null,
        valorIpi: null,
        cstPis: null,
        aliqPis: null,
        basePis: null,
        valorPis: null,
        cstCofins: null,
        aliqCofins: null,
        baseCofins: null,
        valorCofins: null,
        valorFcp: null,
        rateioFrete: 0,
        rateioSeguro: 0,
        rateioOutrasDesp: 0,
        rateioDesconto: 0,
        lot: null,
        lotSerial: null,
        lotQuantity: null,
        lotFabrication: null,
        lotExpiry: null,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: null,
      },
    ]);

    const { getNfeEntryItemsByInvoice } = await import('@/lib/stock-entry-store');
    const [row] = await getNfeEntryItemsByInvoice('c1', 'inv1');
    expect(row.unit_price).toBe(10.01);
    expect(row.total_value_gross).toBe(10.01);
    expect(row.item_discount).toBe(0);
    expect(row.total_value_net).toBe(10.01);
  });
});
