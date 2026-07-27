import ExcelJS from 'exceljs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  registerInvoiceEntry: vi.fn(),
  updateNfeEntryItemLot: vi.fn(),
  cloneNfeEntryItemBatch: vi.fn(),
  invoiceFindMany: vi.fn(),
  nfeFindMany: vi.fn(),
  productRegistryFindMany: vi.fn(),
  productRegistryUpdate: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/stock-entry-store', () => ({
  updateNfeEntryItemLot: mocks.updateNfeEntryItemLot,
  cloneNfeEntryItemBatch: mocks.cloneNfeEntryItemBatch,
}));
vi.mock('@/lib/register-entry', () => ({
  registerInvoiceEntry: mocks.registerInvoiceEntry,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
    nfeEntryItem: {
      findMany: mocks.nfeFindMany,
    },
    productRegistry: {
      findMany: mocks.productRegistryFindMany,
      update: mocks.productRegistryUpdate,
    },
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: mocks.loggerError,
  }),
}));

import { POST as importE509 } from '@/app/api/estoque/import-e509/route';
import { POST as importTypes } from '@/app/api/products/import-types/route';

async function workbookFile(workbook: ExcelJS.Workbook, name: string): Promise<File> {
  const data = await workbook.xlsx.writeBuffer();
  return new File([data], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

function requestWithFile(file: File): Request {
  const formData = new FormData();
  formData.set('file', file);
  return new Request('http://localhost/api/import', { method: 'POST', body: formData });
}

describe('ExcelJS import route regressions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.registerInvoiceEntry.mockResolvedValue(null);
    mocks.productRegistryUpdate.mockResolvedValue({ id: 'registry-1' });
    mocks.updateNfeEntryItemLot.mockResolvedValue({ id: 42, lot: 'LOT-2026' });
    mocks.cloneNfeEntryItemBatch.mockResolvedValue({ id: 43 });
  });

  it('parses a real product type workbook and updates matching products', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Tipos');
    sheet.addRow(['Código', 'Descrição']);
    sheet.addRow(['1 - VALVULAS']);
    sheet.addRow(['CARDIACA']);
    sheet.addRow(['PROD-001', 'Produto teste']);
    mocks.productRegistryFindMany.mockResolvedValue([{ id: 'registry-1', code: 'prod-001' }]);

    const response = await importTypes(requestWithFile(await workbookFile(workbook, 'tipos.xlsx')));

    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ parsed: 1, matched: 1, total: 1 });
    expect(mocks.productRegistryUpdate).toHaveBeenCalledWith({
      where: { id: 'registry-1' },
      data: {
        productType: 'VALVULAS',
        productSubtype: 'CARDIACA',
        updatedAt: expect.any(Date),
      },
    });
  });

  it('round-trips extended conditional formatting through the ExcelJS UUID path', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Formatacao');
    sheet.addRows([[1], [2]]);
    sheet.addConditionalFormatting({
      ref: 'A1:A2',
      rules: [{
        type: 'dataBar',
        cfvo: [{ type: 'min' }, { type: 'max' }],
        color: { argb: 'FF00FF00' },
      }],
    } as never);

    const data = await workbook.xlsx.writeBuffer();
    const loaded = new ExcelJS.Workbook();
    await loaded.xlsx.load(data);
    const roundTripped = await loaded.xlsx.writeBuffer();

    expect(roundTripped.byteLength).toBeGreaterThan(0);
  });

  it('parses a real E509 workbook and assigns its lot to the matched entry', async () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('E509');
    sheet.getCell(3, 1).value = 'NF';
    sheet.getCell(3, 83).value = 'Lote';
    sheet.getCell(5, 1).value = '000123';
    sheet.getCell(5, 9).value = 'access-key-1';
    sheet.getCell(5, 33).value = 'INTERNAL-1';
    sheet.getCell(5, 34).value = 'SUPPLIER-1';
    sheet.getCell(5, 83).value = 'LOT-2026';
    sheet.getCell(5, 84).value = 5;

    mocks.invoiceFindMany.mockResolvedValueOnce([
      { id: 'invoice-1', accessKey: 'access-key-1', number: '123' },
    ]);
    // existing entry check (distinct invoice ids)
    mocks.nfeFindMany
      .mockResolvedValueOnce([{ invoiceId: 'invoice-1' }])
      // match by supplier_code
      .mockResolvedValueOnce([{ id: 42, lot: null, quantity: 5 }]);

    const response = await importE509(requestWithFile(await workbookFile(workbook, 'e509.xlsx')));

    expect(mocks.loggerError).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      imported: 1,
      skipped: 0,
      notFound: 0,
      registered: 0,
      totalRows: 1,
    });
    expect(mocks.updateNfeEntryItemLot).toHaveBeenCalledWith(
      'company-1',
      'invoice-1',
      42,
      { lot: 'LOT-2026', lotQuantity: 5 },
    );
  });
});
