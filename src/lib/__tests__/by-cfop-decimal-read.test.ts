import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  invoiceFindMany: vi.fn(),
  itemFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: () => new Response(JSON.stringify({ error: 'Não autorizado' }), { status: 401 }),
}));
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: { findMany: mocks.invoiceFindMany },
    invoiceItemTax: { findMany: mocks.itemFindMany },
  },
}));

describe('GET /api/fiscal/by-cfop — sidecar Decimal no total', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('u1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'co1' });
    mocks.invoiceFindMany.mockResolvedValue([{ id: 'inv1' }]);
  });

  it('soma totalValueDecimal quando o Float diverge', async () => {
    mocks.itemFindMany.mockResolvedValue([
      {
        cfop: '5102',
        totalValue: 10.009,
        totalValueDecimal: new Decimal('10.01'),
        valorIcms: 0,
        valorPis: 0,
        valorCofins: 0,
        valorIpi: 0,
      },
    ]);
    const { GET } = await import('@/app/api/fiscal/by-cfop/route');
    const res = await GET(new Request('http://localhost/api/fiscal/by-cfop?period=year&year=2026&month=1'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.byCfop[0].totalValue).toBe(10.01);
  });
});
