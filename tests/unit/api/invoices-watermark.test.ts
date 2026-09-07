import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  invoiceAggregate: vi.fn(),
  invoiceCount: vi.fn(),
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
    invoice: {
      aggregate: mocks.invoiceAggregate,
      count: mocks.invoiceCount,
    },
  },
}));

import { GET } from '@/app/api/invoices/watermark/route';

const COMPANY = { id: 'company-1', cnpj: '12345678000199' };

describe('GET /api/invoices/watermark', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue(COMPANY);
  });

  it('returns 304 Not Modified with empty body when If-None-Match matches ETag', async () => {
    const updatedAt = new Date('2026-09-01T12:00:00.000Z');
    const count = 42;
    const expectedEtag = `W/"${updatedAt.getTime()}-${count}"`;

    mocks.invoiceAggregate.mockResolvedValue({
      _max: { updatedAt },
    });
    mocks.invoiceCount.mockResolvedValue(count);

    const req = new Request('http://localhost/api/invoices/watermark', {
      headers: {
        'if-none-match': expectedEtag,
      },
    });

    const res = await GET(req);

    expect(res.status).toBe(304);
    expect(res.headers.get('etag')).toBe(expectedEtag);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');
    const text = await res.text();
    expect(text).toBe('');
  });

  it('returns 200 with changed: true, updatedAt, and count when ETag does not match', async () => {
    const updatedAt = new Date('2026-09-01T12:00:00.000Z');
    const count = 42;
    const expectedEtag = `W/"${updatedAt.getTime()}-${count}"`;

    mocks.invoiceAggregate.mockResolvedValue({
      _max: { updatedAt },
    });
    mocks.invoiceCount.mockResolvedValue(count);

    const req = new Request('http://localhost/api/invoices/watermark', {
      headers: {
        'if-none-match': 'W/"stale-etag"',
      },
    });

    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe(expectedEtag);
    expect(res.headers.get('cache-control')).toBe('private, no-cache');

    const body = await res.json();
    expect(body).toEqual({
      changed: true,
      updatedAt: updatedAt.toISOString(),
      count,
    });
  });

  it('returns 200 with changed: true when If-None-Match header is absent', async () => {
    const updatedAt = new Date('2026-09-01T12:00:00.000Z');
    const count = 10;
    const expectedEtag = `W/"${updatedAt.getTime()}-${count}"`;

    mocks.invoiceAggregate.mockResolvedValue({
      _max: { updatedAt },
    });
    mocks.invoiceCount.mockResolvedValue(count);

    const req = new Request('http://localhost/api/invoices/watermark');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe(expectedEtag);
    const body = await res.json();
    expect(body).toEqual({
      changed: true,
      updatedAt: updatedAt.toISOString(),
      count,
    });
  });

  it('filters by type, direction, and date range when provided in query params', async () => {
    mocks.invoiceAggregate.mockResolvedValue({
      _max: { updatedAt: null },
    });
    mocks.invoiceCount.mockResolvedValue(0);

    const req = new Request(
      'http://localhost/api/invoices/watermark?type=NFE&direction=issued&dateFrom=2026-08-01&dateTo=2026-08-31'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"0-0"');

    const expectedWhere = {
      companyId: COMPANY.id,
      type: 'NFE',
      direction: 'issued',
      issueDate: {
        gte: new Date('2026-08-01T00:00:00.000Z'),
        lte: new Date('2026-08-31T23:59:59.999Z'),
      },
    };

    expect(mocks.invoiceAggregate).toHaveBeenCalledWith({
      where: expectedWhere,
      _max: { updatedAt: true },
    });
    expect(mocks.invoiceCount).toHaveBeenCalledWith({
      where: expectedWhere,
    });
  });

  it('handles null updatedAt when there are no invoices', async () => {
    mocks.invoiceAggregate.mockResolvedValue({
      _max: { updatedAt: null },
    });
    mocks.invoiceCount.mockResolvedValue(0);

    const req = new Request('http://localhost/api/invoices/watermark');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('etag')).toBe('W/"0-0"');
    const body = await res.json();
    expect(body).toEqual({
      changed: true,
      updatedAt: null,
      count: 0,
    });
  });

  it('returns 401 when requireAuth throws unauthorized error', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));

    const req = new Request('http://localhost/api/invoices/watermark');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 403 when requireAuth throws FORBIDDEN', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('FORBIDDEN'));

    const req = new Request('http://localhost/api/invoices/watermark');
    const res = await GET(req);

    expect(res.status).toBe(403);
  });

  it('returns 500 when database throws unexpected error', async () => {
    mocks.invoiceAggregate.mockRejectedValue(new Error('DB connection failed'));

    const req = new Request('http://localhost/api/invoices/watermark');
    const res = await GET(req);

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: 'Internal server error' });
  });
});
