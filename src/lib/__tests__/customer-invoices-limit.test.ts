import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@prisma/client-runtime-utils';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  getContactFiscal: vi.fn(),
  duplicataFindMany: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
    },
    invoiceDuplicata: {
      findMany: mocks.duplicataFindMany,
    },
    productRegistry: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

vi.mock('@/lib/contact-fiscal-store', () => ({
  getContactFiscal: mocks.getContactFiscal,
}));

import { handleContactDetails } from '@/lib/contact-details-shared';

describe('G1 — Customer and supplier details without 500 invoices limit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContactFiscal.mockResolvedValue(null);
    mocks.duplicataFindMany.mockResolvedValue([]);
  });

  it('loads more than 500 invoices and computes full stats accurately', async () => {
    const customerCnpj = '03276524000106'; // Santa Casa CNPJ
    const totalMockCount = 1250;

    // Generate 1250 mock invoices
    const mockInvoices = Array.from({ length: totalMockCount }, (_, i) => {
      const year = 2026 - Math.floor(i / 100);
      const month = String((i % 12) + 1).padStart(2, '0');
      const isSale = i % 2 === 0; // Alternate between Venda (5102) and Consignação (5917)
      return {
        id: `inv-${i}`,
        accessKey: `352601000000000000005500100000${String(i).padStart(6, '0')}1000000010`,
        number: String(10000 + i),
        series: '1',
        issueDate: new Date(`${year}-${month}-15T12:00:00Z`),
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
        totalValue: new Decimal('100.00'),
        status: 'received',
        cfop: isSale ? '5102' : '5917',
      };
    });

    mocks.findMany
      // Step 1: metadata query (must support > 500 invoices)
      .mockResolvedValueOnce(mockInvoices)
      // Step 4b: batch with XML query (limited to recent candidates)
      .mockResolvedValue([]);

    mocks.findUnique.mockResolvedValue({
      xmlContent: `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe><dest><CNPJ>${customerCnpj}</CNPJ><xNome>ASSOCIACAO BENF. DE CAMPO GRANDE</xNome></dest></infNFe></NFe></nfeProc>`,
    });

    const res = await handleContactDetails(
      { id: 'company-1' },
      customerCnpj,
      null,
      false,
      'customer',
    );

    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify take parameter on findMany call was at least 10000 (not 500)
    const findManyArgs = mocks.findMany.mock.calls[0][0];
    expect(findManyArgs.take).toBeGreaterThanOrEqual(10000);

    // Verify purchases stats reflect ALL 1250 invoices, not capped at 500
    expect(data.purchases.totalInvoices).toBe(1250);

    // Sales (5102) were 625 invoices of 100.00 = 62500
    expect(data.purchases.totalValue).toBe(62500);

    // Full invoice list is returned
    expect(data.invoices).toHaveLength(1250);

    // First and last issue dates cover full range
    expect(data.purchases.lastIssueDate).toBe(mockInvoices[0].issueDate.toISOString());
    expect(data.purchases.firstIssueDate).toBe(mockInvoices[totalMockCount - 1].issueDate.toISOString());
  });

  it('reads duplicates directly from invoice_duplicata table when available', async () => {
    const customerCnpj = '03276524000106';
    const mockInvoices = [
      {
        id: 'inv-1',
        accessKey: '3526010000000000000055001000000000011000000010',
        number: '1001',
        series: '1',
        issueDate: new Date('2026-08-01T12:00:00Z'),
        recipientCnpj: customerCnpj,
        recipientName: 'ASSOCIACAO BENF. DE CAMPO GRANDE',
        totalValue: new Decimal('500.00'),
        status: 'received',
        cfop: '5102',
      },
    ];

    mocks.findMany.mockResolvedValueOnce(mockInvoices).mockResolvedValueOnce([]);
    mocks.findUnique.mockResolvedValue({
      xmlContent: `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe><dest><CNPJ>${customerCnpj}</CNPJ><xNome>ASSOCIACAO BENF. DE CAMPO GRANDE</xNome></dest></infNFe></NFe></nfeProc>`,
    });

    mocks.duplicataFindMany.mockResolvedValueOnce([
      {
        invoiceId: 'inv-1',
        dupNumero: '001',
        dupVencimento: '2026-09-01',
        dupValor: 250,
        dupValorDecimal: new Decimal('250.00'),
      },
      {
        invoiceId: 'inv-1',
        dupNumero: '002',
        dupVencimento: '2026-10-01',
        dupValor: 250,
        dupValorDecimal: new Decimal('250.00'),
      },
    ]);

    const res = await handleContactDetails(
      { id: 'company-1' },
      customerCnpj,
      null,
      false,
      'customer',
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.duplicates).toHaveLength(2);
    expect(data.duplicates[0].invoiceNumber).toBe('1001');
    expect(data.duplicates[0].installmentNumber).toBe('002');
    expect(data.duplicates[0].installmentValue).toBe(250);
    expect(data.duplicates[0].installmentTotal).toBe(2);
    expect(data.duplicates[1].installmentNumber).toBe('001');
  });
});
