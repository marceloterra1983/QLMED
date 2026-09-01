import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FISCAL-009 no ponto de integração: a dedução incremental de revenda tem de
 * casar a linha pelos mesmos caminhos do rebuild. Antes usava só a productKey
 * exata e ignorava em silêncio a linha que só bate por EAN ou por descrição.
 */

interface RegistryRow {
  id: string;
  companyId: string;
  productKey: string;
  code: string | null;
  unit: string | null;
  ean: string | null;
  description: string;
  aggTotalQuantity: number;
  aggTotalValue: number;
  aggResaleQuantity: number;
  aggAveragePrice: number;
  aggLastSaleDate: Date | null;
  aggLastSalePrice: number | null;
}

const registry: RegistryRow[] = [];

const mocks = vi.hoisted(() => ({
  acquireLock: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: mocks.acquireLock,
  productAggregateLockKey: (id: string) => id,
}));
// Rotas laterais da função, fora do escopo deste teste.
vi.mock('@/lib/parse-invoice-tax', () => ({ extractAllTaxData: () => null }));
vi.mock('@/lib/invoice-tax-store', () => ({ upsertTaxTotals: vi.fn(), upsertItemTaxes: vi.fn() }));
vi.mock('@/lib/parse-invoice-xml', () => ({ extractPartyFiscalData: () => null }));
vi.mock('@/lib/contact-fiscal-store', () => ({ upsertContactFiscal: vi.fn() }));

const tx = {
  productRegistry: {
    findMany: async ({ select }: { select: Record<string, boolean> }) =>
      registry.map((r) => Object.fromEntries(Object.keys(select).map((k) => [k, r[k as keyof RegistryRow]]))),
    findUnique: async ({ where }: { where: { id?: string } }) =>
      registry.find((r) => r.id === where.id) ?? null,
    update: async ({ where, data }: { where: { id: string }; data: Partial<RegistryRow> }) => {
      const row = registry.find((r) => r.id === where.id)!;
      Object.assign(row, data);
      return row;
    },
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

/** NF-e de saída para cliente de revenda, com uma linha só. */
function saleXml(item: { cProd: string; xProd: string; uCom: string; ean?: string; qCom: number }) {
  return `<nfeProc><NFe><infNFe>
    <ide><CFOP>5102</CFOP></ide>
    <det><prod>
      <cProd>${item.cProd}</cProd>
      <xProd>${item.xProd}</xProd>
      ${item.ean ? `<cEAN>${item.ean}</cEAN>` : ''}
      <NCM>90211010</NCM>
      <CFOP>5102</CFOP>
      <uCom>${item.uCom}</uCom>
      <qCom>${item.qCom}</qCom>
      <vUnCom>10</vUnCom>
      <vProd>${item.qCom * 10}</vProd>
    </prod></det>
  </infNFe></NFe></nfeProc>`;
}

function seedRegistry() {
  registry.length = 0;
  registry.push({
    id: 'p-kit',
    companyId: 'company-1',
    // A productKey grava o caminho EAN; a venda vem com outro cProd e outra
    // descrição, então o matching exato antigo não achava por descrição.
    productKey: 'CODE:KIT-CAT::UNIT:CX',
    code: 'KIT-CAT',
    unit: 'CX',
    ean: '7899999999994',
    description: 'KIT CIRURGICO DESCARTAVEL',
    aggTotalQuantity: 30,
    aggTotalValue: 300,
    aggResaleQuantity: 0,
    aggAveragePrice: 10,
    aggLastSaleDate: null,
    aggLastSalePrice: null,
  });
}

async function runSale(xml: string) {
  await updateProductAggregatesForInvoice({
    companyId: 'company-1',
    invoiceId: 'inv-1',
    xmlContent: xml,
    direction: 'issued',
    issueDate: new Date('2026-06-01T00:00:00.000Z'),
    senderName: 'QL MED',
    senderCnpj: '11222333000181',
    recipientName: 'NAVIX DISTRIBUIDORA LTDA',
    recipientCnpj: '99888777000166',
    invoiceNumber: '1',
    ignoreRebuildCutoff: true,
  });
}

describe('dedução incremental de revenda — FISCAL-009', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.acquireLock.mockResolvedValue({ release: vi.fn() });
    seedRegistry();
  });

  it('deduz a linha que só casa pelo EAN (o incremental antigo ignorava)', async () => {
    await runSale(saleXml({
      cProd: 'OUTRO-CODIGO',
      xProd: 'KIT DESCARTAVEL NOME DIFERENTE',
      uCom: 'CX',
      ean: '7899999999994',
      qCom: 3,
    }));

    const row = registry[0];
    expect(row.aggResaleQuantity).toBe(3);
    expect(row.aggTotalQuantity).toBe(27);
    expect(row.aggTotalValue).toBe(270);
  });

  it('deduz a linha que só casa por descrição + unidade', async () => {
    await runSale(saleXml({
      cProd: '-',
      xProd: 'KIT CIRURGICO DESCARTAVEL',
      uCom: 'CX',
      qCom: 2,
    }));

    expect(registry[0].aggResaleQuantity).toBe(2);
    expect(registry[0].aggTotalQuantity).toBe(28);
  });

  it('continua deduzindo pelo código exato (caminho que já funcionava)', async () => {
    await runSale(saleXml({ cProd: 'KIT-CAT', xProd: 'KIT CIRURGICO', uCom: 'CX', qCom: 1 }));

    expect(registry[0].aggResaleQuantity).toBe(1);
    expect(registry[0].aggTotalQuantity).toBe(29);
  });

  it('não deduz uma linha que não é do catálogo', async () => {
    await runSale(saleXml({ cProd: 'NAO-EXISTE', xProd: 'PRODUTO ALHEIO', uCom: 'UN', qCom: 5 }));

    expect(registry[0].aggResaleQuantity).toBe(0);
    expect(registry[0].aggTotalQuantity).toBe(30);
  });
});
