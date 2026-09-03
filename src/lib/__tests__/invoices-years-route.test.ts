import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  queryRaw: vi.fn(),
  aggregate: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    $queryRaw: mocks.queryRaw,
    invoice: {
      aggregate: mocks.aggregate,
    },
  },
}));

import { GET } from '@/app/api/invoices/years/route';

describe('GET /api/invoices/years — Dynamic fiscal years route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-1', cnpj: '07832309000197' });
  });

  it('returns 401 when authentication is missing', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const req = new Request('http://localhost/api/invoices/years');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns available years from queryRaw ordered descending', async () => {
    mocks.queryRaw.mockResolvedValue([
      { year: 2026 },
      { year: 2025 },
      { year: 2024 },
      { year: 2023 },
      { year: 2022 },
      { year: 2011 },
      { year: 2010 },
    ]);

    const req = new Request('http://localhost/api/invoices/years?type=NFE&direction=issued');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.years).toEqual([2026, 2025, 2024, 2023, 2022, 2011, 2010]);
  });

  it('falls back to aggregate min/max when queryRaw throws', async () => {
    mocks.queryRaw.mockRejectedValue(new Error('Syntax or mock error'));
    mocks.aggregate.mockResolvedValue({
      _min: { issueDate: new Date('2022-03-01T00:00:00Z') },
      _max: { issueDate: new Date('2026-08-01T00:00:00Z') },
    });

    const req = new Request('http://localhost/api/invoices/years?type=CTE');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.years).toEqual([2026, 2025, 2024, 2023, 2022]);
  });
});
