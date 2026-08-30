import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  userFindUnique: vi.fn(),
  listImpcgAuthorizations: vi.fn(),
  getImpcgIngestState: vi.fn(),
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

vi.mock('@/lib/impcg/store', () => ({
  listImpcgAuthorizations: mocks.listImpcgAuthorizations,
  getImpcgIngestState: mocks.getImpcgIngestState,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import {
  formatImpcgMoney,
  GET,
  sortImpcgListItems,
} from '@/app/api/gestao/impcg/route';

describe('IMPCG list contract (AC-001, AC-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.userFindUnique.mockResolvedValue({
      role: 'editor',
      allowedPages: ['/gestao/impcg'],
    });
    mocks.getImpcgIngestState.mockResolvedValue(null);
  });

  it('formats money as a two-decimal string, never a number', () => {
    expect(formatImpcgMoney('12550.00')).toBe('12550.00');
    expect(formatImpcgMoney('12550')).toBe('12550.00');
    expect(formatImpcgMoney(12550)).toBe('12550.00');
    expect(typeof formatImpcgMoney('12550.00')).toBe('string');
  });

  it('sorts by issuedAt desc then oficioNumber desc (AC-001)', () => {
    const sorted = sortImpcgListItems([
      { issuedAt: '2023-08-01T00:00:00.000Z', oficioNumber: '17674' },
      { issuedAt: '2023-08-10T00:00:00.000Z', oficioNumber: '17670' },
      { issuedAt: '2023-08-10T00:00:00.000Z', oficioNumber: '17673' },
      { issuedAt: null, oficioNumber: '1' },
    ]);
    expect(sorted.map((row) => row.oficioNumber)).toEqual(['17673', '17670', '17674', '1']);
  });

  it('returns empty items without invented rows (AC-004)', async () => {
    mocks.listImpcgAuthorizations.mockResolvedValue([]);

    const res = await GET(new Request('http://localhost/api/gestao/impcg'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(body.lastCollectedAt).toBeNull();
    expect(body.lastError).toBeNull();
    expect(body.canSync).toBe(true);
    expect(body).not.toHaveProperty('companyId');
    expect(JSON.stringify(body)).not.toContain('companyId');
  });

  it('serializes list items with decimal strings and no companyId', async () => {
    mocks.listImpcgAuthorizations.mockResolvedValue([
      {
        id: 'clx-17673',
        issuedAt: '2023-08-10T00:00:00.000Z',
        oficioNumber: '17673',
        patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
        doctorName: 'RODRIGO LUIZ ROCHA CARDOSO',
        hospitalName: 'HOSPITAL PRONCOR',
        totalAmount: '12550.00',
        fileName: 'OFICIO 17673 PLINIO ANTONIO ARANHA JUNIOR.pdf',
        parseStatus: 'ok',
      },
    ]);
    mocks.getImpcgIngestState.mockResolvedValue({
      lastSuccessAt: new Date('2026-08-30T13:00:00.000Z'),
      lastError: null,
    });

    const res = await GET(new Request('http://localhost/api/gestao/impcg'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.lastCollectedAt).toBe('2026-08-30T13:00:00.000Z');
    expect(body.items).toHaveLength(1);
    expect(body.items[0].totalAmount).toBe('12550.00');
    expect(typeof body.items[0].totalAmount).toBe('string');
    expect(body.items[0]).not.toHaveProperty('companyId');
    expect(body.items[0].oficioNumber).toBe('17673');
    expect(mocks.getOrCreateSingleCompany).toHaveBeenCalledWith('user-1');
    expect(mocks.listImpcgAuthorizations).toHaveBeenCalledWith('company-1');
  });
});
