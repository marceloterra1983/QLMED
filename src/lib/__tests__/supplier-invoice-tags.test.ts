import { describe, it, expect } from 'vitest';
import { CONTACT_KINDS } from '@/components/contact-details/contact-kinds';
import type { ContactInvoice } from '@/components/contact-details/contact-detail-types';

describe('CONTACT_KINDS — primaryInvoiceTags classification', () => {
  it('inclui "Venda" nas tags primárias do fornecedor para notas comerciais de entrada', () => {
    const supplierTags = CONTACT_KINDS.supplier.primaryInvoiceTags;
    expect(supplierTags).toContain('Venda');
    expect(supplierTags).toContain('Compra');
    expect(supplierTags).toContain('Compra Importação');
    expect(supplierTags).toContain('Bonificação');
  });

  it('classifica notas de fornecedor com tag Venda como notas fiscais principais (não movimentações)', () => {
    const supplierTags = new Set(CONTACT_KINDS.supplier.primaryInvoiceTags);

    const mockInvoices: ContactInvoice[] = [
      {
        id: 'inv-1',
        number: '1234',
        series: '1',
        issueDate: '2026-08-01T10:00:00Z',
        totalValue: 50000,
        status: 'received',
        accessKey: '35260800000000000000550010000012341000012340',
        cfopTag: 'Venda', // CFOP 5102 / 6102 emitido pelo fornecedor
      },
      {
        id: 'inv-2',
        number: '1235',
        series: '1',
        issueDate: '2026-08-02T10:00:00Z',
        totalValue: 12000,
        status: 'received',
        accessKey: '35260800000000000000550010000012351000012350',
        cfopTag: 'Compra Importação', // CFOP 3102
      },
      {
        id: 'inv-3',
        number: '1236',
        series: '1',
        issueDate: '2026-08-03T10:00:00Z',
        totalValue: 3000,
        status: 'received',
        accessKey: '35260800000000000000550010000012361000012360',
        cfopTag: 'Consignação', // CFOP 5917 / 6917
      },
      {
        id: 'inv-4',
        number: '1237',
        series: '1',
        issueDate: '2026-08-04T10:00:00Z',
        totalValue: 1500,
        status: 'received',
        accessKey: '35260800000000000000550010000012371000012370',
        cfopTag: 'Demonstração', // CFOP 5912 / 6912
      },
    ];

    const primary: ContactInvoice[] = [];
    const movimentacoes: ContactInvoice[] = [];

    for (const inv of mockInvoices) {
      if (supplierTags.has(inv.cfopTag)) {
        primary.push(inv);
      } else {
        movimentacoes.push(inv);
      }
    }

    // inv-1 (Venda) e inv-2 (Compra Importação) devem ir para primary
    expect(primary).toHaveLength(2);
    expect(primary.map((i) => i.id)).toEqual(['inv-1', 'inv-2']);

    // inv-3 (Consignação) e inv-4 (Demonstração) devem ir para movimentações
    expect(movimentacoes).toHaveLength(2);
    expect(movimentacoes.map((i) => i.id)).toEqual(['inv-3', 'inv-4']);
  });

  it('mantém as tags primárias do cliente restritas a Venda e Bonificação', () => {
    const customerTags = CONTACT_KINDS.customer.primaryInvoiceTags;
    expect(customerTags).toEqual(['Venda', 'Bonificação']);
  });
});
