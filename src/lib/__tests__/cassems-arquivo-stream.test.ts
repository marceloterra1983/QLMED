import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireCassemsPage: vi.fn(),
  getCassemsAuthorization: vi.fn(),
  connectionFindFirst: vi.fn(),
  ensureValidOneDriveAccessToken: vi.fn(),
  openOneDriveItemContent: vi.fn(),
  logged: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/cassems/access', () => ({
  requireCassemsPage: mocks.requireCassemsPage,
}));

vi.mock('@/lib/cassems/store', () => ({
  getCassemsAuthorization: mocks.getCassemsAuthorization,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    oneDriveConnection: { findFirst: mocks.connectionFindFirst },
  },
}));

vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: mocks.ensureValidOneDriveAccessToken,
}));

vi.mock('@/lib/onedrive-client', () => ({
  openOneDriveItemContent: mocks.openOneDriveItemContent,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    error: vi.fn(),
    warn: vi.fn(),
    info: (payload: Record<string, unknown>) => {
      mocks.logged.push(payload);
    },
  }),
}));

import { GET } from '@/app/api/gestao/cassems/[id]/arquivo/route';

const AUTH_ID = 'clx000000000000000000000';

function pdfStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('CASSEMS arquivo route (SPEC-033 FR-004, FR-005)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logged.length = 0;
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.requireCassemsPage.mockResolvedValue({ ok: true, companyId: 'company-1' });
    mocks.getCassemsAuthorization.mockResolvedValue({
      id: AUTH_ID,
      oneDriveItemId: 'item-1',
      fileName: 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE.pdf',
    });
    mocks.connectionFindFirst.mockResolvedValue({ id: 'conn-1', driveId: 'drive-1' });
    mocks.ensureValidOneDriveAccessToken.mockResolvedValue('token');
  });

  it('devolve o corpo em streaming como application/pdf', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 conteudo');
    mocks.openOneDriveItemContent.mockResolvedValue({ body: pdfStream(bytes), size: bytes.length });

    const res = await GET(new Request('http://localhost/arquivo'), {
      params: Promise.resolve({ id: AUTH_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    expect(res.headers.get('Content-Disposition')).toContain('inline');
    expect(res.headers.get('Content-Length')).toBe(String(bytes.length));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
  });

  it('responde antes de o arquivo terminar de chegar do OneDrive', async () => {
    let finish: (() => void) | null = null;
    mocks.openOneDriveItemContent.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('%PDF'));
          finish = () => controller.close();
        },
      }),
      size: null,
    });

    const res = await GET(new Request('http://localhost/arquivo'), {
      params: Promise.resolve({ id: AUTH_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(ReadableStream);
    expect(res.headers.get('Content-Length')).toBeNull();
    expect(finish).not.toBeNull();
    finish!();
  });

  it('registra durationMs e bytes para a latência ser mensurável em produção', async () => {
    const bytes = new TextEncoder().encode('%PDF');
    mocks.openOneDriveItemContent.mockResolvedValue({ body: pdfStream(bytes), size: bytes.length });

    await GET(new Request('http://localhost/arquivo'), {
      params: Promise.resolve({ id: AUTH_ID }),
    });

    expect(mocks.logged.some((entry) => typeof entry.durationMs === 'number')).toBe(true);
    expect(mocks.logged.some((entry) => entry.bytes === bytes.length)).toBe(true);
  });
});
