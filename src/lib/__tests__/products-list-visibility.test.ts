import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  findFirst: vi.fn(),
  count: vi.fn(),
  findMany: vi.fn(),
  aggregate: vi.fn(),
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

vi.mock('@/lib/prisma', () => ({
  default: {
    productRegistry: {
      findFirst: mocks.findFirst,
      count: mocks.count,
      findMany: mocks.findMany,
      aggregate: mocks.aggregate,
    },
  },
}));

import { GET } from '@/app/api/products/list/route';

describe('GET /api/products/list — Product visibility without aggregate barrier', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-1', cnpj: '07832309000197' });
    mocks.aggregate.mockResolvedValue({ _sum: { aggTotalQuantity: 10 } });
  });

  it('does NOT filter out products with aggComputedAt null even if other products have aggregates', async () => {
    // There is an existing product with aggComputedAt != null
    mocks.findFirst.mockResolvedValue({ id: 'existing-with-agg' });

    mocks.count.mockResolvedValue(2);
    mocks.findMany.mockResolvedValue([
      {
        productKey: 'prod-1',
        codigo: '00001',
        code: 'VALV-01',
        description: 'Válvula Aórtica',
        unit: 'UN',
        outOfLine: false,
        aggComputedAt: new Date(),
        aggLastPrice: 1500,
      },
      {
        productKey: 'prod-new',
        codigo: '00002',
        code: 'CAT-02',
        description: 'Cateter Balão (Novo)',
        unit: 'UN',
        outOfLine: false,
        aggComputedAt: null, // New product, not yet aggregated!
        aggLastPrice: null,
      },
    ]);

    const req = new Request('http://localhost/api/products/list?page=1&limit=50');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();

    // Verify where clause passed to count and findMany does NOT contain aggComputedAt: { not: null }
    const countWhere = mocks.count.mock.calls[0][0].where;
    expect(countWhere.aggComputedAt).toBeUndefined();

    const findManyWhere = mocks.findMany.mock.calls[0][0].where;
    expect(findManyWhere.aggComputedAt).toBeUndefined();

    // Verify both products are returned
    expect(data.products).toHaveLength(2);
    expect(data.products[0].code).toBe('VALV-01');
    expect(data.products[1].code).toBe('CAT-02');
    expect(data.products[1].lastPrice).toBe(0);
  });

  it('allows searching newly created products by description or code without aggSearchText', async () => {
    mocks.findFirst.mockResolvedValue({ id: 'existing-with-agg' });
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([
      {
        productKey: 'prod-new',
        codigo: '00002',
        code: 'NOVO-99',
        description: 'Stent Coronário',
        unit: 'UN',
        outOfLine: false,
        aggComputedAt: null,
        aggSearchText: null,
      },
    ]);

    const req = new Request('http://localhost/api/products/list?page=1&limit=50&search=Stent');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const findManyWhere = mocks.findMany.mock.calls[0][0].where;

    // Search filter must include OR with description and code, not just aggSearchText
    const andClauses = findManyWhere.AND;
    expect(andClauses).toBeDefined();
    const searchClause = andClauses.find((c: any) => c.OR);
    expect(searchClause).toBeDefined();

    const orFields = searchClause.OR.map((o: any) => Object.keys(o)[0]);
    expect(orFields).toContain('description');
    expect(orFields).toContain('code');
  });
});
