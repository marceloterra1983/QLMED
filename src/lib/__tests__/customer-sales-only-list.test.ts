import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client-runtime-utils';

const mocks = vi.hoisted(() => ({
  groupBy: vi.fn(),
  findMany: vi.fn(),
  contactNicknameFindMany: vi.fn(),
  contactFiscalFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      groupBy: mocks.groupBy,
      findMany: mocks.findMany,
    },
    contactNickname: {
      findMany: mocks.contactNicknameFindMany,
    },
    contactFiscal: {
      findMany: mocks.contactFiscalFindMany,
    },
    invoiceItemTax: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { handleContactList } from '@/lib/contact-shared';

describe('G1 — Customer list calculates totalValue strictly from sales invoices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.contactNicknameFindMany.mockResolvedValue([]);
    mocks.contactFiscalFindMany.mockResolvedValue([]);
    mocks.findMany.mockResolvedValue([]);
  });

  it('calculates totalValue for customers using only Venda CFOPs, ignoring consignments and demonstrations', async () => {
    const customerCnpj = '03276524000106';

    // Group 1: All invoices (e.g. 5750 total count, sum of all is 18.9M)
    const mockGroupedAll = [
      {
        _count: { _all: 5750 },
        _sum: { totalValue: new Decimal('18973060.41') }, // Includes 7.1M in consignments, 1.1M in returns
        _min: { issueDate: new Date('2010-10-01T00:00:00Z') },
        _max: { issueDate: new Date('2026-09-02T16:20:36Z') },
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
      },
      {
        _count: { _all: 406 },
        _sum: { totalValue: new Decimal('4812935.01') }, // Procat: 4.5M in demonstrations
        _min: { issueDate: new Date('2021-01-01T00:00:00Z') },
        _max: { issueDate: new Date('2026-08-01T00:00:00Z') },
        recipientCnpj: '19080416000195',
        recipientName: 'Procat Intervencoes Cardiovasculares',
      },
    ];

    // Group 2 & 3: prevYear and currentYear counts
    const mockGroupedPrevYear = [
      {
        _count: { _all: 300 },
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
      },
    ];
    const mockGroupedCurrentYear = [
      {
        _count: { _all: 200 },
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
      },
    ];

    // Group 4: Sales ONLY (filtered by CFOPs of Venda)
    const mockGroupedSales = [
      {
        _count: { _all: 4798 },
        _sum: { totalValue: new Decimal('10430320.92') }, // Sales ONLY!
        _min: { issueDate: new Date('2011-02-15T00:00:00Z') },
        _max: { issueDate: new Date('2026-09-02T16:20:36Z') },
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
      },
      {
        _count: { _all: 8 },
        _sum: { totalValue: new Decimal('20746.02') }, // Procat sales ONLY!
        _min: { issueDate: new Date('2022-01-01T00:00:00Z') },
        _max: { issueDate: new Date('2026-05-01T00:00:00Z') },
        recipientCnpj: '19080416000195',
        recipientName: 'Procat Intervencoes Cardiovasculares',
      },
    ];

    mocks.groupBy
      .mockResolvedValueOnce(mockGroupedAll)
      .mockResolvedValueOnce(mockGroupedPrevYear)
      .mockResolvedValueOnce(mockGroupedCurrentYear)
      .mockResolvedValueOnce(mockGroupedSales);

    const searchParams = new URLSearchParams({ page: '1', limit: '50' });
    const response = await handleContactList({ id: 'comp-1' }, 'customer', searchParams);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.customers).toHaveLength(2);

    const santaCasa = data.customers.find((c: any) => c.cnpj === customerCnpj);
    expect(santaCasa).toBeDefined();

    // CRITICAL: totalValue must be 10430320.92 (Sales ONLY), NOT 18973060.41!
    expect(santaCasa.totalValue).toBe(10430320.92);

    const procat = data.customers.find((c: any) => c.cnpj === '19080416000195');
    expect(procat).toBeDefined();

    // CRITICAL: Procat totalValue must be 20746.02 (Sales ONLY), NOT 4812935.01!
    expect(procat.totalValue).toBe(20746.02);

    // Verify 4th groupBy call passed CFOP filter with sales codes
    expect(mocks.groupBy).toHaveBeenCalledTimes(4);
    const salesCall = mocks.groupBy.mock.calls[3][0];
    expect(salesCall.where.cfop).toBeDefined();
    expect(salesCall.where.cfop.in).toContain('5102');
    expect(salesCall.where.cfop.in).toContain('6102');
  });

  it('keeps standard behavior for suppliers without filtering out non-sales', async () => {
    const mockSupplierInvoices = [
      {
        _count: { _all: 20 },
        _sum: { totalValue: new Decimal('1125656.70') },
        _min: { issueDate: new Date('2025-01-08T00:00:00Z') },
        _max: { issueDate: new Date('2026-08-31T00:00:00Z') },
        senderCnpj: '43894609000750',
        senderName: 'Politec Importacao e Comercio Ltda',
      },
    ];

    mocks.groupBy
      .mockResolvedValueOnce(mockSupplierInvoices)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const searchParams = new URLSearchParams({ page: '1', limit: '50' });
    const response = await handleContactList({ id: 'comp-1' }, 'supplier', searchParams);

    expect(response.status).toBe(200);
    const data = await response.json();

    expect(data.suppliers).toHaveLength(1);
    expect(data.suppliers[0].totalValue).toBe(1125656.7);
    // For suppliers, only 3 groupBy calls are executed (no groupedSales)
    expect(mocks.groupBy).toHaveBeenCalledTimes(3);
  });
});
