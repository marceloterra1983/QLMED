import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CONTACT_KINDS } from '@/components/contact-details/contact-kinds';
import { getCfopTagByCode } from '@/lib/cfop';
import type { ContactInvoice } from '@/components/contact-details/contact-detail-types';

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  findUnique: vi.fn(),
  getContactFiscal: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.findMany,
      findUnique: mocks.findUnique,
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

describe('Politec CFOP 6106 Invoices Classification (G2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getContactFiscal.mockResolvedValue(null);
  });

  it('getCfopTagByCode recognizes CFOP 6106 as "Venda"', () => {
    expect(getCfopTagByCode('6106')).toBe('Venda');
  });

  it('ContactDetailsModal places CFOP 6106 invoices into primaryInvoices (Notas Fiscais)', () => {
    const supplierTags = new Set(CONTACT_KINDS.supplier.primaryInvoiceTags);
    expect(supplierTags.has('Venda')).toBe(true);

    const politecInvoices: ContactInvoice[] = [
      {
        id: 'politec-inv-1',
        number: '39400',
        series: '10',
        issueDate: '2026-08-31T17:27:00Z',
        totalValue: 60895.8,
        status: 'received',
        accessKey: '35260843894609000750550100000394001000039400',
        cfopTag: getCfopTagByCode('6106') || 'Outros',
      },
      {
        id: 'politec-inv-2',
        number: '36365',
        series: '10',
        issueDate: '2026-07-20T18:58:00Z',
        totalValue: 64278.9,
        status: 'received',
        accessKey: '35260743894609000750550100000363651000036365',
        cfopTag: getCfopTagByCode('6106') || 'Outros',
      },
    ];

    const primary: ContactInvoice[] = [];
    const movimentacoes: ContactInvoice[] = [];

    for (const inv of politecInvoices) {
      if (supplierTags.has(inv.cfopTag)) {
        primary.push(inv);
      } else {
        movimentacoes.push(inv);
      }
    }

    expect(primary).toHaveLength(2);
    expect(primary.map((i) => i.number)).toEqual(['39400', '36365']);
    expect(movimentacoes).toHaveLength(0);
  });

  it('handleContactDetails sets cfopTag = "Venda" for supplier invoices with CFOP 6106', async () => {
    const politecCnpj = '43894609000750';
    mocks.findMany
      .mockResolvedValueOnce([
        {
          id: 'inv-politec-1',
          accessKey: '35260843894609000750550100000394001000039400',
          number: '39400',
          series: '10',
          issueDate: new Date('2026-08-31T17:27:00Z'),
          senderCnpj: politecCnpj,
          senderName: 'Politec Importacao e Comercio Ltda',
          totalValue: 60895.8,
          status: 'received',
          cfop: '6106',
        },
      ])
      // Batch with XML
      .mockResolvedValueOnce([
        {
          id: 'inv-politec-1',
          xmlContent: `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe>
    <infNFe>
      <emit><CNPJ>${politecCnpj}</CNPJ><xNome>Politec Importacao e Comercio Ltda</xNome></emit>
      <det nItem="1">
        <prod><cProd>123</cProd><xProd>Cateter</xProd><CFOP>6106</CFOP><qCom>10</qCom><vUnCom>6089.58</vUnCom><vProd>60895.80</vProd></prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`,
        },
      ]);

    mocks.findUnique.mockResolvedValue({
      xmlContent: `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe><emit><CNPJ>${politecCnpj}</CNPJ><xNome>Politec Importacao e Comercio Ltda</xNome></emit></infNFe></NFe></nfeProc>`,
    });

    const res = await handleContactDetails(
      { id: 'company-1' },
      politecCnpj,
      null,
      false,
      'supplier',
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.invoices).toHaveLength(1);
    expect(data.invoices[0].number).toBe('39400');
    expect(data.invoices[0].cfopTag).toBe('Venda');
  });
});
