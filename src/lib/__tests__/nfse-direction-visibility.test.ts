import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  findMany: vi.fn(),
  count: vi.fn(),
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

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findMany: mocks.findMany,
      count: mocks.count,
    },
    contactNickname: {
      findMany: vi.fn().mockResolvedValue([]),
    },
  },
}));

import { GET } from '@/app/api/invoices/route';

describe('G4 — NFS-e direction visibility and multi-direction queries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-1', cnpj: '07832309000197' });
    mocks.count.mockResolvedValue(1);
    mocks.findMany.mockResolvedValue([]);
  });

  it('queries without direction filter when direction is empty/omitted, allowing all NFS-e', async () => {
    const req = new Request('http://localhost/api/invoices?type=NFSE');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('NFSE');
    expect(where.direction).toBeUndefined();
  });

  it('filters by direction=received when requested', async () => {
    const req = new Request('http://localhost/api/invoices?type=NFSE&direction=received');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('NFSE');
    expect(where.direction).toBe('received');
  });

  it('filters by direction=issued when requested (giving visibility to service provision NFS-e)', async () => {
    const req = new Request('http://localhost/api/invoices?type=NFSE&direction=issued');
    const res = await GET(req);

    expect(res.status).toBe(200);
    const where = mocks.findMany.mock.calls[0][0].where;
    expect(where.type).toBe('NFSE');
    expect(where.direction).toBe('issued');
  });

  it('page-client.tsx does not hardcode direction=received in its search params', () => {
    const clientPath = path.join(process.cwd(), 'src/app/(painel)/fiscal/nfse-recebidas/page-client.tsx');
    const content = readFileSync(clientPath, 'utf8');

    // Must not have direction: 'received' hardcoded in the query params object
    expect(content).not.toMatch(/direction:\s*['"]received['"]/);
  });
});
