import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Catálogo oficial Spica: agregador (incremental + rebuild) NÃO pode criar
 * product_registry a partir de NF — isso reintroduzia órfãos/teste.
 */

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  findUnique: vi.fn(),
  update: vi.fn(),
  acquireLock: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: mocks.acquireLock,
  productAggregateLockKey: (id: string) => id,
}));
vi.mock('@/lib/parse-invoice-tax', () => ({ extractAllTaxData: () => null }));
vi.mock('@/lib/invoice-tax-store', () => ({ upsertTaxTotals: vi.fn(), upsertItemTaxes: vi.fn() }));
vi.mock('@/lib/parse-invoice-xml', () => ({ extractPartyFiscalData: () => null }));
vi.mock('@/lib/contact-fiscal-store', () => ({ upsertContactFiscal: vi.fn() }));
vi.mock('@/lib/invoice-duplicata-store', () => ({ extractAndStoreDuplicatas: vi.fn() }));

const tx = {
  productRegistry: {
    findUnique: mocks.findUnique,
    update: mocks.update,
    create: mocks.create,
  },
};

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
    invoice: { findUnique: async () => null },
    productAggregateRebuildState: { findUnique: async () => null },
  },
}));

import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';

function purchaseXml() {
  return `<nfeProc><NFe><infNFe>
    <ide><CFOP>1102</CFOP></ide>
    <det><prod>
      <cProd>ORPHAN-XYZ</cProd>
      <xProd>PRODUTO ORFAO DE TESTE</xProd>
      <NCM>90211010</NCM>
      <CFOP>1102</CFOP>
      <uCom>UN</uCom>
      <qCom>1</qCom>
      <vUnCom>10</vUnCom>
      <vProd>10</vProd>
    </prod></det>
  </infNFe></NFe></nfeProc>`;
}

describe('product aggregate catalog-only', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.findUnique.mockReset();
    mocks.update.mockReset();
    mocks.acquireLock.mockResolvedValue({ release: async () => undefined });
    mocks.findUnique.mockResolvedValue(null);
  });

  it('source: rebuild não define createMissingProduct nem productRegistry.create', () => {
    const rebuild = readFileSync(
      resolve(__dirname, '../product-aggregate-rebuild.ts'),
      'utf8',
    );
    expect(rebuild).not.toContain('createMissingProduct');
    expect(rebuild).not.toMatch(/productRegistry\.create/);
    expect(rebuild).toContain('product_aggregate_rebuild_skipped_missing');
  });

  it('incremental: NF recebida com produto desconhecido não cria registry', async () => {
    await updateProductAggregatesForInvoice({
      companyId: 'company-1',
      invoiceId: 'inv-1',
      xmlContent: purchaseXml(),
      direction: 'received',
      issueDate: new Date('2026-01-15'),
      senderName: 'FORNECEDOR',
      senderCnpj: '123',
      recipientName: 'SPICA',
      recipientCnpj: '07832309000197',
      invoiceNumber: '1',
      ignoreRebuildCutoff: true,
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
