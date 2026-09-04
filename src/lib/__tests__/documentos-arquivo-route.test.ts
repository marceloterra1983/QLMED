import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT } from '@/lib/documentos/constants';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireDocumentosPage: vi.fn(),
  documentFindFirst: vi.fn(),
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

vi.mock('@/lib/documentos/access', () => ({
  requireDocumentosPage: mocks.requireDocumentosPage,
  canWriteDocumentos: (role: string) => role === 'admin' || role === 'editor',
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: { findFirst: mocks.documentFindFirst },
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

import { GET } from '@/app/api/documentos/[id]/arquivo/route';

const DOC_ID = 'clxdocumentos0000000001';

function pdfStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

describe('GET /api/documentos/[id]/arquivo (SPEC-042 FR-004, AC-004)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logged.length = 0;
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'viewer',
    });
    mocks.documentFindFirst.mockResolvedValue({
      id: DOC_ID,
      oneDriveItemId: 'item-1',
      fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
    });
    mocks.connectionFindFirst.mockResolvedValue({ id: 'conn-1', driveId: 'drive-1' });
    mocks.ensureValidOneDriveAccessToken.mockResolvedValue('token');
  });

  it('401 sem sessão', async () => {
    mocks.requireAuth.mockRejectedValue(new Error('NOT_AUTHENTICATED'));
    const res = await GET(new Request('http://localhost/api/documentos/x/arquivo'), {
      params: Promise.resolve({ id: DOC_ID }),
    });
    expect(res.status).toBe(401);
    expect(mocks.openOneDriveItemContent).not.toHaveBeenCalled();
  });

  it('403 sem a página', async () => {
    const { NextResponse } = await import('next/server');
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
    });
    const res = await GET(new Request('http://localhost/api/documentos/x/arquivo'), {
      params: Promise.resolve({ id: DOC_ID }),
    });
    expect(res.status).toBe(403);
    expect(mocks.openOneDriveItemContent).not.toHaveBeenCalled();
  });

  it('200 application/pdf inline, com filename*=UTF-8', async () => {
    const bytes = new TextEncoder().encode('%PDF-1.7 conteudo');
    mocks.openOneDriveItemContent.mockResolvedValue({ body: pdfStream(bytes), size: bytes.length });

    const res = await GET(new Request('http://localhost/api/documentos/x/arquivo'), {
      params: Promise.resolve({ id: DOC_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toContain('inline');
    expect(disposition).toContain("filename*=UTF-8''");
    expect(res.headers.get('Content-Length')).toBe(String(bytes.length));
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(bytes);
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DOC_ID, companyId: 'company-1' } }),
    );
  });

  it('?download=1 → Content-Disposition attachment', async () => {
    const bytes = new TextEncoder().encode('%PDF');
    mocks.openOneDriveItemContent.mockResolvedValue({ body: pdfStream(bytes), size: bytes.length });

    const res = await GET(new Request('http://localhost/api/documentos/x/arquivo?download=1'), {
      params: Promise.resolve({ id: DOC_ID }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('attachment');
    expect(res.headers.get('Content-Disposition')).not.toContain('inline');
  });

  it('conexão nomeada sem fallback: where inclui accountEmail e 404 se ausente', async () => {
    mocks.connectionFindFirst.mockResolvedValue(null);

    const res = await GET(new Request('http://localhost/api/documentos/x/arquivo'), {
      params: Promise.resolve({ id: DOC_ID }),
    });

    expect(res.status).toBe(404);
    expect(mocks.connectionFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.connectionFindFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-1', accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
    });
    expect(mocks.openOneDriveItemContent).not.toHaveBeenCalled();
  });
});
