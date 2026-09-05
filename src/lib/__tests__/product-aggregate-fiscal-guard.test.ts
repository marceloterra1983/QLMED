import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * FR-009 (specs/043-spica-product-import): NF-e de entrada NÃO pode sobrescrever
 * tributação mestre quando `fiscalSitTributaria` já está preenchida (Spica/cadastro).
 */

type RegistryFiscal = {
  id: string;
  companyId: string;
  code: string;
  fiscalSitTributaria: string | null;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalIpi: number | null;
  fiscalCfopEntrada: string | null;
};

const registry: RegistryFiscal[] = [];
const itemTaxUpserts: unknown[] = [];

const mocks = vi.hoisted(() => ({
  acquireLock: vi.fn(),
  extractAllTaxData: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: mocks.acquireLock,
  productAggregateLockKey: (id: string) => id,
}));

vi.mock('@/lib/parse-invoice-tax', () => ({
  extractAllTaxData: (...args: unknown[]) => mocks.extractAllTaxData(...args),
}));

vi.mock('@/lib/invoice-tax-store', () => ({
  upsertTaxTotals: vi.fn(),
  upsertItemTaxes: vi.fn(async (...args: unknown[]) => {
    itemTaxUpserts.push(args);
  }),
}));

vi.mock('@/lib/parse-invoice-xml', () => ({ extractPartyFiscalData: () => null }));
vi.mock('@/lib/contact-fiscal-store', () => ({ upsertContactFiscal: vi.fn() }));
vi.mock('@/lib/invoice-duplicata-store', () => ({ extractAndStoreDuplicatas: vi.fn() }));

vi.mock('@/lib/prisma', () => ({
  default: {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) =>
      fn({
        productRegistry: {
          findUnique: async () => null,
          findMany: async () => [],
          update: async () => null,
          create: async () => null,
        },
      }),
    invoice: { findUnique: async () => null },
    productAggregateRebuildState: { findUnique: async () => null },
    productRegistry: {
      findMany: async ({
        where,
        select,
      }: {
        where: { companyId: string; code: { equals: string; mode: string } };
        select: Record<string, boolean>;
      }) => {
        const code = where.code.equals.toLowerCase();
        return registry
          .filter(
            (r) =>
              r.companyId === where.companyId &&
              (r.code || '').toLowerCase() === code,
          )
          .map((r) =>
            Object.fromEntries(
              Object.keys(select).map((k) => [k, r[k as keyof RegistryFiscal]]),
            ),
          );
      },
      update: async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<RegistryFiscal> & { updatedAt?: Date };
      }) => {
        const row = registry.find((r) => r.id === where.id);
        if (!row) throw new Error(`missing ${where.id}`);
        Object.assign(row, data);
        return row;
      },
    },
  },
}));

import { updateProductAggregatesForInvoice } from '@/lib/product-aggregate-updater';

function purchaseXml(cProd: string) {
  return `<nfeProc><NFe><infNFe>
    <ide><CFOP>1102</CFOP></ide>
    <det><prod>
      <cProd>${cProd}</cProd>
      <xProd>PRODUTO TESTE</xProd>
      <NCM>90211010</NCM>
      <CFOP>1102</CFOP>
      <uCom>UN</uCom>
      <qCom>1</qCom>
      <vUnCom>10</vUnCom>
      <vProd>10</vProd>
    </prod>
    <imposto>
      <ICMS><ICMS00><pICMS>18</pICMS></ICMS00></ICMS>
      <PIS><PISAliq><pPIS>1.65</pPIS></PISAliq></PIS>
      <COFINS><COFINSAliq><pCOFINS>7.6</pCOFINS></COFINSAliq></COFINS>
      <IPI><IPITrib><pIPI>5</pIPI></IPITrib></IPI>
    </imposto></det>
  </infNFe></NFe></nfeProc>`;
}

async function runReceived(cProd: string) {
  await updateProductAggregatesForInvoice({
    companyId: 'company-1',
    invoiceId: 'inv-tax-1',
    xmlContent: purchaseXml(cProd),
    direction: 'received',
    issueDate: new Date('2026-03-01'),
    senderName: 'FORNECEDOR',
    senderCnpj: '123',
    recipientName: 'SPICA',
    recipientCnpj: '07832309000197',
    invoiceNumber: '99',
    ignoreRebuildCutoff: true,
  });
}

describe('FR-009 blindagem fiscal — NF-e não sobrescreve mestre Spica', () => {
  beforeEach(() => {
    registry.length = 0;
    itemTaxUpserts.length = 0;
    mocks.acquireLock.mockResolvedValue({ release: async () => undefined });
    mocks.extractAllTaxData.mockResolvedValue({
      totals: {
        vprod: 10,
        vbc: 10,
        vicms: 1.8,
        vbcSt: null,
        vicmsSt: null,
        vpis: 0.16,
        vcofins: 0.76,
        vipi: 0.5,
        vfrete: null,
        vseg: null,
        vdesc: null,
        voutro: null,
        vtottrib: null,
        vfcp: null,
        vnf: 10,
      },
      items: [
        {
          itemNumber: 1,
          productCode: 'SPICA01',
          productDescription: 'PRODUTO TESTE',
          ncm: '90211010',
          cfop: '1102',
          cest: null,
          origem: '0',
          quantity: 1,
          unitPrice: 10,
          totalValue: 10,
          itemDiscount: null,
          cstIcms: '00',
          baseIcms: 10,
          aliqIcms: 18,
          valorIcms: 1.8,
          baseIcmsSt: null,
          valorIcmsSt: null,
          cstIpi: '50',
          aliqIpi: 5,
          baseIpi: 10,
          valorIpi: 0.5,
          cstPis: '01',
          aliqPis: 1.65,
          basePis: 10,
          valorPis: 0.16,
          cstCofins: '01',
          aliqCofins: 7.6,
          baseCofins: 10,
          valorCofins: 0.76,
          valorFcp: null,
        },
      ],
    });
  });

  it('preserva alíquotas quando fiscalSitTributaria já está preenchida', async () => {
    registry.push({
      id: 'p-spica',
      companyId: 'company-1',
      code: 'SPICA01',
      fiscalSitTributaria: '040',
      fiscalIcms: 12,
      fiscalPis: 0.65,
      fiscalCofins: 3,
      fiscalIpi: 0,
      fiscalCfopEntrada: '5102',
    });

    await runReceived('SPICA01');

    const row = registry[0]!;
    expect(row.fiscalIcms).toBe(12);
    expect(row.fiscalPis).toBe(0.65);
    expect(row.fiscalCofins).toBe(3);
    expect(row.fiscalIpi).toBe(0);
    expect(row.fiscalCfopEntrada).toBe('5102');
    expect(row.fiscalSitTributaria).toBe('040');
  });

  it('preenche alíquotas quando fiscalSitTributaria ainda é NULL', async () => {
    registry.push({
      id: 'p-empty',
      companyId: 'company-1',
      code: 'SPICA01',
      fiscalSitTributaria: null,
      fiscalIcms: null,
      fiscalPis: null,
      fiscalCofins: null,
      fiscalIpi: null,
      fiscalCfopEntrada: null,
    });

    await runReceived('SPICA01');

    const row = registry[0]!;
    expect(row.fiscalIcms).toBe(18);
    expect(row.fiscalPis).toBe(1.65);
    expect(row.fiscalCofins).toBe(7.6);
    expect(row.fiscalIpi).toBe(5);
    expect(row.fiscalCfopEntrada).toBe('1102');
  });
});
