import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  ensureLocalXmlSyncNow: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    requireEditor: vi.fn(),
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/local-xml-sync', () => ({
  ensureLocalXmlSyncNow: mocks.ensureLocalXmlSyncNow,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.findMany,
      count: mocks.count,
      aggregate: mocks.aggregate,
    },
  },
}));

import { GET } from '@/app/api/invoices/route';

describe('GET /api/invoices — sem sync forçado no list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-1', cnpj: '07832309000197' });
    mocks.findMany.mockResolvedValue([]);
    mocks.count.mockResolvedValue(0);
    mocks.aggregate.mockResolvedValue({ _sum: { totalValue: null } });
    mocks.ensureLocalXmlSyncNow.mockResolvedValue(undefined);
  });

  it('não dispara ensureLocalXmlSyncNow em direction=issued', async () => {
    const req = new Request(
      'http://localhost/api/invoices?direction=issued&type=NFE&page=1&limit=20',
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(mocks.ensureLocalXmlSyncNow).not.toHaveBeenCalled();
  });
});
