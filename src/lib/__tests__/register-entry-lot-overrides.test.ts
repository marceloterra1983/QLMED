import { beforeEach, describe, expect, it, vi } from 'vitest';

const captured: { lot: string | null; lotQuantity: number | null }[] = [];

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findFirst: vi.fn(async () => ({
        id: 'inv-1',
        number: '1',
        senderName: 'S',
        senderCnpj: '1',
        issueDate: new Date('2026-01-01'),
        totalValue: 100,
        accessKey: null,
        xmlContent: `<nfeProc>
          <NFe><infNFe>
            <det nItem="1">
              <prod cProd="A1" qCom="10" vProd="100"><xProd>Item</xProd></prod>
            </det>
          </infNFe></NFe>
        </nfeProc>`,
      })),
    },
    productRegistry: { findMany: vi.fn(async () => []) },
  },
}));

vi.mock('@/lib/stock-entry-store', () => ({
  upsertStockEntry: vi.fn(async () => ({ id: 'entry-1' })),
  updateStockEntryFiscalTotals: vi.fn(async () => {}),
  insertNfeEntryItems: vi.fn(async (_id: string, items: { lot: string | null; lotQuantity: number | null }[]) => {
    captured.splice(0, captured.length, ...items.map((i) => ({ lot: i.lot, lotQuantity: i.lotQuantity })));
  }),
}));

vi.mock('@/lib/parse-invoice-tax', () => ({
  extractTaxTotals: vi.fn(async () => null),
  extractItemTaxes: vi.fn(async () => []),
  extractEmitterLocation: vi.fn(async () => ({ city: null, state: null })),
}));

vi.mock('@/lib/stock-ledger', () => ({
  recordMovementsFromEntryItems: vi.fn(async () => 0),
}));

describe('registerInvoiceEntry lotOverrides', () => {
  beforeEach(() => {
    captured.length = 0;
  });

  it('reparte quantidade nula do override a partir do qCom do item', async () => {
    const { registerInvoiceEntry } = await import('@/lib/register-entry');
    const overrides = new Map([
      [1, [
        { lot: 'L1', expiry: null, quantity: 4 },
        { lot: 'L2', expiry: null, quantity: null },
      ]],
    ]);
    await registerInvoiceEntry('c-1', 'inv-1', 'u-1', overrides);
    expect(captured).toEqual([
      { lot: 'L1', lotQuantity: 4 },
      { lot: 'L2', lotQuantity: 6 },
    ]);
  });
});
