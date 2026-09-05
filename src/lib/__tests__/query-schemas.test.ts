import { describe, expect, it } from 'vitest';
import { buildProductExportUrl, escapeCsvValue } from '../product-export';
import { financeiroListQuerySchema } from '../schemas/financeiro';
import { invoiceBulkDownloadSchema } from '../schemas/invoice';
import { productsListQuerySchema } from '../schemas/product';

describe('query schemas', () => {
  it('validates products list query params', () => {
    const parsed = productsListQuerySchema.parse({
      sort: 'productType',
      order: 'asc',
      lineStatus: 'all',
      exportAll: '1',
      onlyMissingAnvisa: 'true',
    });

    expect(parsed.sort).toBe('productType');
    expect(parsed.lineStatus).toBe('all');
    expect(parsed.exportAll).toBe(true);
    expect(parsed.onlyMissingAnvisa).toBe(true);
  });

  it('defaults lineStatus to all so fora-de-linha Spica aparece', () => {
    const parsed = productsListQuerySchema.parse({});
    expect(parsed.lineStatus).toBe('all');
    expect(parsed.limit).toBe(50);
  });

  it('rejects invalid products list sort and line status', () => {
    expect(productsListQuerySchema.safeParse({ sort: 'lastIssue' }).success).toBe(false);
    expect(productsListQuerySchema.safeParse({ lineStatus: 'inactive' }).success).toBe(false);
  });

  it('validates financeiro list query params', () => {
    const parsed = financeiroListQuerySchema.parse({
      page: '3',
      limit: '2000',
      status: 'due_soon',
      sort: 'valor',
      order: 'desc',
      dateFrom: '2026-03-01',
      dateTo: '2026-03-31',
    });

    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(2000);
    expect(parsed.status).toBe('due_soon');
    expect(parsed.sort).toBe('valor');

    expect(financeiroListQuerySchema.parse({ sort: 'emitente' }).sort).toBe('emitente');
  });

  it('rejects invalid financeiro pagination, status, sort, and dates', () => {
    expect(financeiroListQuerySchema.safeParse({ limit: '2001' }).success).toBe(false);
    expect(financeiroListQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
    expect(financeiroListQuerySchema.safeParse({ sort: 'createdAt' }).success).toBe(false);
    expect(financeiroListQuerySchema.safeParse({ dateFrom: '2026-04-10', dateTo: '2026-04-01' }).success).toBe(false);
  });

  it('builds product CSV export URL with the active filters', () => {
    const url = new URL(buildProductExportUrl({
      search: ' valvula ',
      sort: 'lastIssueDate',
      order: 'desc',
      lineStatus: 'outOfLine',
      productType: 'Cardio',
      productSubtype: '',
      productSubgroup: 'Acessorios',
      onlyMissingAnvisa: true,
    }), 'https://qlmed.local');

    expect(url.pathname).toBe('/api/products/list');
    expect(url.searchParams.get('exportAll')).toBe('1');
    expect(url.searchParams.get('search')).toBe('valvula');
    expect(url.searchParams.get('lineStatus')).toBe('outOfLine');
    expect(url.searchParams.get('productType')).toBe('Cardio');
    expect(url.searchParams.get('productSubtype')).toBeNull();
    expect(url.searchParams.get('productSubgroup')).toBe('Acessorios');
    expect(url.searchParams.get('onlyMissingAnvisa')).toBe('1');
  });

  it('escapes CSV values with separators, line breaks, quotes, and spreadsheet formulas', () => {
    expect(escapeCsvValue('a;b')).toBe('"a;b"');
    expect(escapeCsvValue('a\nb')).toBe('"a\nb"');
    expect(escapeCsvValue('a "b"')).toBe('"a ""b"""');
    expect(escapeCsvValue('=SUM(1,1)')).toBe("'=SUM(1,1)");
    expect(escapeCsvValue('@cmd')).toBe("'@cmd");
  });

  it('limits bulk invoice download payload size', () => {
    expect(invoiceBulkDownloadSchema.safeParse({
      ids: Array.from({ length: 200 }, (_, idx) => `invoice-${idx}`),
      format: 'xml',
    }).success).toBe(true);

    expect(invoiceBulkDownloadSchema.safeParse({
      ids: Array.from({ length: 201 }, (_, idx) => `invoice-${idx}`),
      format: 'xml',
    }).success).toBe(false);
  });
});
