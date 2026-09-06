import { describe, expect, it, vi, beforeEach } from 'vitest';

describe('invoice-ingest-pipeline', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('executes all pipeline stages for received invoice', async () => {
    const updateAggregatesOnly = vi.fn(async () => undefined);
    const extractAndStoreTaxData = vi.fn(async () => undefined);
    const extractAndStoreContactFiscal = vi.fn(async () => undefined);
    const extractAndStoreDuplicatas = vi.fn(async () => undefined);
    const linkInvoiceItems = vi.fn(async () => ({ linked: 2, pending: 0, writes: 2 }));

    vi.doMock('@/lib/product-aggregate-updater', () => ({
      updateProductAggregatesOnly,
      extractAndStoreTaxData,
      extractAndStoreContactFiscal,
    }));
    vi.doMock('@/lib/invoice-duplicata-store', () => ({
      extractAndStoreDuplicatas,
    }));
    vi.doMock('@/lib/nfe-item-link/store', () => ({
      linkInvoiceItems,
    }));

    const { processIngestedInvoice } = await import('@/lib/invoice-ingest-pipeline');

    const result = await processIngestedInvoice({
      companyId: 'comp-1',
      invoiceId: 'inv-1',
      xmlContent: '<nfeProc></nfeProc>',
      direction: 'received',
      issueDate: new Date('2026-09-01'),
      senderName: 'Fornecedor X',
      senderCnpj: '12345678000199',
      recipientName: 'QLMED',
      recipientCnpj: '98765432000188',
      invoiceNumber: '100',
    });

    expect(result.success).toBe(true);
    expect(result.invoiceId).toBe('inv-1');
    expect(updateAggregatesOnly).toHaveBeenCalledTimes(1);
    expect(extractAndStoreTaxData).toHaveBeenCalledWith('inv-1', 'comp-1', '<nfeProc></nfeProc>');
    expect(extractAndStoreContactFiscal).toHaveBeenCalledWith('inv-1', 'comp-1', '<nfeProc></nfeProc>');
    expect(extractAndStoreDuplicatas).toHaveBeenCalledWith('inv-1', 'comp-1', '<nfeProc></nfeProc>');
    expect(linkInvoiceItems).toHaveBeenCalledTimes(1);

    const stages = result.stages.map((s) => ({ stage: s.stage, status: s.status }));
    expect(stages).toEqual([
      { stage: 'product_aggregates', status: 'ok' },
      { stage: 'tax_data', status: 'ok' },
      { stage: 'contact_fiscal', status: 'ok' },
      { stage: 'duplicatas', status: 'ok' },
      { stage: 'item_links', status: 'ok' },
    ]);
  });

  it('skips item_links for issued invoice', async () => {
    const linkInvoiceItems = vi.fn();
    vi.doMock('@/lib/product-aggregate-updater', () => ({
      updateProductAggregatesOnly: vi.fn(async () => undefined),
      extractAndStoreTaxData: vi.fn(async () => undefined),
      extractAndStoreContactFiscal: vi.fn(async () => undefined),
    }));
    vi.doMock('@/lib/invoice-duplicata-store', () => ({
      extractAndStoreDuplicatas: vi.fn(async () => undefined),
    }));
    vi.doMock('@/lib/nfe-item-link/store', () => ({
      linkInvoiceItems,
    }));

    const { processIngestedInvoice } = await import('@/lib/invoice-ingest-pipeline');

    const result = await processIngestedInvoice({
      companyId: 'comp-1',
      invoiceId: 'inv-2',
      xmlContent: '<nfeProc></nfeProc>',
      direction: 'issued',
      issueDate: new Date('2026-09-01'),
      senderName: 'QLMED',
      senderCnpj: '98765432000188',
      recipientName: 'Cliente Y',
      recipientCnpj: '11111111000111',
      invoiceNumber: '101',
    });

    expect(linkInvoiceItems).not.toHaveBeenCalled();
    const itemLinkStage = result.stages.find((s) => s.stage === 'item_links');
    expect(itemLinkStage?.status).toBe('skipped');
  });

  it('isolates stage failure so other stages continue', async () => {
    vi.doMock('@/lib/product-aggregate-updater', () => ({
      updateProductAggregatesOnly: vi.fn(async () => undefined),
      extractAndStoreTaxData: vi.fn(async () => {
        throw new Error('Tax parsing corrupted');
      }),
      extractAndStoreContactFiscal: vi.fn(async () => undefined),
    }));
    const extractAndStoreDuplicatas = vi.fn(async () => undefined);
    vi.doMock('@/lib/invoice-duplicata-store', () => ({
      extractAndStoreDuplicatas,
    }));
    vi.doMock('@/lib/nfe-item-link/store', () => ({
      linkInvoiceItems: vi.fn(async () => ({ linked: 0, pending: 0, writes: 0 })),
    }));

    const { processIngestedInvoice } = await import('@/lib/invoice-ingest-pipeline');

    const result = await processIngestedInvoice({
      companyId: 'comp-1',
      invoiceId: 'inv-3',
      xmlContent: '<nfeProc></nfeProc>',
      direction: 'received',
      issueDate: new Date('2026-09-01'),
      senderName: 'X',
      senderCnpj: '1',
      recipientName: 'Y',
      recipientCnpj: '2',
      invoiceNumber: '102',
    });

    // Duplicatas still ran even though tax data threw
    expect(extractAndStoreDuplicatas).toHaveBeenCalledTimes(1);
    const taxStage = result.stages.find((s) => s.stage === 'tax_data');
    expect(taxStage?.status).toBe('error');
    expect(taxStage?.error).toContain('Tax parsing corrupted');
  });
});
