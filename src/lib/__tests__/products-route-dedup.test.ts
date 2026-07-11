import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Behavior-preservation snapshot test for GET /api/products (CODEDUP-01).
 *
 * This test is run BOTH before (Task 1 baseline) and after (Task 3) the
 * dedup refactor of src/app/api/products/route.ts. It must produce a
 * byte-identical JSON payload in both runs — any diff means the refactor
 * changed behavior, which is not allowed for this pure Extract-Method /
 * import-sharing change.
 *
 * Fixtures (3 invoices):
 * 1. received NFe with 2 <det> items — units "UNID" and "CAIXA" — exercises
 *    normalizeUnit/UNIT_ALIASES collapsing both to "UN"/"CX".
 * 2. issued NFe with CFOP 3102 (import entry) — exercises Pass 2.
 * 3. issued NFe to a resale customer (NAVIX) reselling the same
 *    code+unit as fixture 1's first item — exercises Pass 3 deduction.
 */

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  getProductRegistryByKeys: vi.fn(),
  invoiceFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/product-registry-store', () => ({
  getProductRegistryByKeys: mocks.getProductRegistryByKeys,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.invoiceFindMany,
    },
  },
}));

import { GET } from '@/app/api/products/route';

const RECEIVED_XML = `
<nfeProc>
  <NFe>
    <infNFe>
      <det>
        <prod>
          <cProd>PROD-001</cProd>
          <xProd>Luva Cirurgica Esteril</xProd>
          <NCM>40151900</NCM>
          <uCom>UNID</uCom>
          <qCom>10</qCom>
          <vUnCom>2.5</vUnCom>
          <vProd>25.00</vProd>
        </prod>
      </det>
      <det>
        <prod>
          <cProd>PROD-002</cProd>
          <xProd>Seringa Descartavel</xProd>
          <NCM>90183900</NCM>
          <uCom>CAIXA</uCom>
          <qCom>5</qCom>
          <vUnCom>12</vUnCom>
          <vProd>60.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

const IMPORT_XML = `
<nfeProc>
  <NFe>
    <infNFe>
      <det>
        <prod>
          <cProd>VALVE-100</cProd>
          <xProd>Valvula Cardiaca Importada</xProd>
          <NCM>90211010</NCM>
          <CFOP>3102</CFOP>
          <uCom>UN</uCom>
          <qCom>2</qCom>
          <vUnCom>5000</vUnCom>
          <vProd>10000.00</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

const RESALE_XML = `
<nfeProc>
  <NFe>
    <infNFe>
      <det>
        <prod>
          <cProd>PROD-001</cProd>
          <xProd>Luva Cirurgica Esteril</xProd>
          <NCM>40151900</NCM>
          <CFOP>5102</CFOP>
          <uCom>UNID</uCom>
          <qCom>3</qCom>
          <vUnCom>2.5</vUnCom>
          <vProd>7.50</vProd>
        </prod>
      </det>
    </infNFe>
  </NFe>
</nfeProc>`;

interface FixtureInvoice {
  id: string;
  number: string;
  issueDate: Date;
  createdAt: Date;
  senderName: string;
  senderCnpj: string;
  recipientName: string;
  recipientCnpj: string;
  xmlContent: string;
  direction: 'received' | 'issued';
}

const FIXTURE_INVOICES: FixtureInvoice[] = [
  {
    id: 'inv-received-1',
    number: '1001',
    issueDate: new Date('2026-01-10T00:00:00.000Z'),
    createdAt: new Date('2026-01-10T00:00:00.000Z'),
    senderName: 'Fornecedor Teste Ltda',
    senderCnpj: '11111111000111',
    recipientName: 'QLMED',
    recipientCnpj: '07832309000197',
    xmlContent: RECEIVED_XML,
    direction: 'received',
  },
  {
    id: 'inv-import-1',
    number: '2001',
    issueDate: new Date('2026-02-05T00:00:00.000Z'),
    createdAt: new Date('2026-02-05T00:00:00.000Z'),
    senderName: 'QLMED',
    senderCnpj: '07832309000197',
    recipientName: 'Corcym Fornecedor Exterior',
    recipientCnpj: '22222222000122',
    xmlContent: IMPORT_XML,
    direction: 'issued',
  },
  {
    id: 'inv-resale-1',
    number: '3001',
    issueDate: new Date('2026-03-01T00:00:00.000Z'),
    createdAt: new Date('2026-03-01T00:00:00.000Z'),
    senderName: 'QLMED',
    senderCnpj: '07832309000197',
    recipientName: 'NAVIX DISTRIBUIDORA HOSPITALAR LTDA',
    recipientCnpj: '33333333000133',
    xmlContent: RESALE_XML,
    direction: 'issued',
  },
];

type PrismaFindManyArgs = {
  where?: { id?: { in?: string[] }; direction?: string };
  select?: Record<string, boolean>;
  take?: number;
};

function invoiceFindManyImpl(args: PrismaFindManyArgs = {}) {
  const { where = {}, select = {}, take } = args;

  let pool = FIXTURE_INVOICES;
  if (where.id?.in) {
    const idSet = new Set(where.id.in);
    pool = FIXTURE_INVOICES.filter((invoice) => idSet.has(invoice.id));
  } else if (where.direction) {
    pool = FIXTURE_INVOICES.filter((invoice) => invoice.direction === where.direction);
  }

  const selectKeys = Object.keys(select);
  const projected = pool.map((invoice) => {
    const row: Record<string, unknown> = {};
    for (const key of selectKeys) {
      if (select[key]) {
        row[key] = (invoice as unknown as Record<string, unknown>)[key];
      }
    }
    return row;
  });

  return Promise.resolve(typeof take === 'number' ? projected.slice(0, take) : projected);
}

describe('GET /api/products — dedup behavior-preservation snapshot (CODEDUP-01)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.getProductRegistryByKeys.mockResolvedValue([]);
    mocks.invoiceFindMany.mockImplementation(invoiceFindManyImpl);
  });

  it('returns the same products/summary/pagination/meta payload pre and post refactor', async () => {
    const response = await GET(
      new Request('http://localhost/api/products?limit=50&sort=lastIssue&order=desc'),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchSnapshot();
  });
});
