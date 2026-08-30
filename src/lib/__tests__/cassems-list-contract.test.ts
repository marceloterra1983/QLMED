import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  userFindUnique: vi.fn(),
  listCassemsAuthorizations: vi.fn(),
  getCassemsIngestState: vi.fn(),
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
    user: { findUnique: mocks.userFindUnique },
  },
}));

vi.mock('@/lib/cassems/store', () => ({
  listCassemsAuthorizations: mocks.listCassemsAuthorizations,
  getCassemsIngestState: mocks.getCassemsIngestState,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import {
  formatCassemsMoney,
  GET,
  sortCassemsListItems,
} from '@/app/api/gestao/cassems/route';

describe('CASSEMS list contract (AC-001, AC-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.userFindUnique.mockResolvedValue({
      role: 'editor',
      allowedPages: ['/gestao/cassems'],
    });
    mocks.getCassemsIngestState.mockResolvedValue(null);
  });

  it('formats money as a two-decimal string, never a number', () => {
    expect(formatCassemsMoney('4760.00')).toBe('4760.00');
    expect(formatCassemsMoney('4760')).toBe('4760.00');
    expect(typeof formatCassemsMoney('4760.00')).toBe('string');
  });

  it('sorts by issuedAt desc then oficioNumber desc (AC-001)', () => {
    const sorted = sortCassemsListItems([
      { issuedAt: '2026-08-01T00:00:00.000Z', oficioNumber: '2479325232' },
      { issuedAt: '2026-08-28T00:00:00.000Z', oficioNumber: '2479325230' },
      { issuedAt: '2026-08-28T00:00:00.000Z', oficioNumber: '2479325231' },
      { issuedAt: null, oficioNumber: '1' },
    ]);
    expect(sorted.map((row) => row.oficioNumber)).toEqual(['2479325231', '2479325230', '2479325232', '1']);
  });

  it('returns empty items without invented rows (AC-004)', async () => {
    mocks.listCassemsAuthorizations.mockResolvedValue([]);

    const res = await GET(new Request('http://localhost/api/gestao/cassems'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.lastCollectedAt).toBeNull();
    expect(body.canSync).toBe(true);
    expect(body).not.toHaveProperty('companyId');
  });

  it('serializes list items with decimal strings and no companyId', async () => {
    mocks.listCassemsAuthorizations.mockResolvedValue([
      {
        id: 'clx-2479325231',
        issuedAt: '2026-08-28T00:00:00.000Z',
        oficioNumber: '2479325231',
        patientName: 'DOUGLAS BARBOSA FELIPE',
        doctorName: 'ISMAEL ESCOBAR CAPIATRA',
        hospitalName: 'HOSPITAL CASSEMS UNIDADE DE CAMPO GRANDE',
        totalAmount: '4760.00',
        fileName: 'CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf',
        parseStatus: 'ok',
      },
    ]);
    mocks.getCassemsIngestState.mockResolvedValue({
      lastSuccessAt: new Date('2026-08-30T14:30:00.000Z'),
      lastError: null,
    });

    const res = await GET(new Request('http://localhost/api/gestao/cassems'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].totalAmount).toBe('4760.00');
    expect(typeof body.items[0].totalAmount).toBe('string');
    expect(body.items[0]).not.toHaveProperty('companyId');
    expect(mocks.getOrCreateSingleCompany).toHaveBeenCalledWith('user-1');
  });
});
