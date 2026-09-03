import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceTable, MovimentacoesTable, DuplicatasTable } from '@/components/contact-details/InvoiceListSection';
import type { ContactInvoice, ContactDuplicate } from '@/components/contact-details/contact-detail-types';

describe('G2 — Progressive table display for large invoice collections', () => {
  const dummyHandlers = {
    onView: vi.fn(),
    onDetails: vi.fn(),
    onDelete: vi.fn(),
  };

  it('InvoiceTable shows progressive display footer when invoices exceed displayCount (100)', () => {
    // Generate 150 invoices
    const invoices: ContactInvoice[] = Array.from({ length: 150 }, (_, i) => ({
      id: `inv-${i}`,
      number: String(1000 + i),
      series: '1',
      issueDate: '2026-08-01T10:00:00Z',
      totalValue: 100,
      status: 'received',
      accessKey: `352608000000000000005500100000${String(i).padStart(6, '0')}1000000010`,
      cfopTag: 'Venda',
    }));

    const installmentsMap = new Map<string, { totalInstallments: number; firstDueDate: Date | null }>();

    const html = renderToStaticMarkup(
      <InvoiceTable
        invoices={invoices}
        installmentsMap={installmentsMap}
        emptyLabel="Nenhuma nota encontrada"
        {...dummyHandlers}
      />
    );

    // Initial render must show 100 of 150
    expect(html).toContain('Exibindo 100 de 150 notas fiscais');
    expect(html).toContain('Mostrar mais (+100)');
    expect(html).toContain('Mostrar todas (150)');
  });

  it('MovimentacoesTable shows progressive display footer when count exceeds 100', () => {
    const invoices: ContactInvoice[] = Array.from({ length: 120 }, (_, i) => ({
      id: `mov-${i}`,
      number: String(2000 + i),
      series: '1',
      issueDate: '2026-08-01T10:00:00Z',
      totalValue: 50,
      status: 'received',
      accessKey: `352608000000000000005500100000${String(i).padStart(6, '0')}2000000010`,
      cfopTag: 'Consignação',
    }));

    const html = renderToStaticMarkup(
      <MovimentacoesTable
        invoices={invoices}
        {...dummyHandlers}
      />
    );

    expect(html).toContain('Exibindo 100 de 120 movimentações');
    expect(html).toContain('Mostrar mais (+100)');
    expect(html).toContain('Mostrar todas (120)');
  });

  it('DuplicatasTable shows progressive display footer when count exceeds 100', () => {
    const duplicates: ContactDuplicate[] = Array.from({ length: 130 }, (_, i) => ({
      invoiceId: `inv-${i}`,
      invoiceNumber: String(3000 + i),
      installmentNumber: '001',
      dueDate: '2026-10-15',
      installmentValue: 150,
      installmentTotal: 1,
    }));

    const html = renderToStaticMarkup(
      <DuplicatasTable
        duplicates={duplicates}
      />
    );

    expect(html).toContain('Exibindo 100 de 130 duplicatas');
    expect(html).toContain('Mostrar mais (+100)');
    expect(html).toContain('Mostrar todas (130)');
  });

  it('does NOT show progressive footer when items are 100 or less', () => {
    const smallList: ContactInvoice[] = Array.from({ length: 25 }, (_, i) => ({
      id: `inv-${i}`,
      number: String(100 + i),
      series: '1',
      issueDate: '2026-08-01T10:00:00Z',
      totalValue: 100,
      status: 'received',
      accessKey: `352608000000000000005500100000${String(i).padStart(6, '0')}1000000010`,
      cfopTag: 'Venda',
    }));

    const html = renderToStaticMarkup(
      <InvoiceTable
        invoices={smallList}
        installmentsMap={new Map()}
        emptyLabel="Vazio"
        {...dummyHandlers}
      />
    );

    expect(html).not.toContain('Mostrar mais');
    expect(html).not.toContain('Mostrar todas');
  });
});
