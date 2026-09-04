import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CERTIDAO_FOLDER,
  CERTIDAO_UPLOAD_NAME,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_ONEDRIVE_ROOT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import { DocumentosIngestBusyError } from '@/lib/documentos/ingest';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireDocumentosPage: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdateMany: vi.fn(),
  connectionFindFirst: vi.fn(),
  ensureValidOneDriveAccessToken: vi.fn(),
  uploadOneDriveFile: vi.fn(),
  runDocumentosIngest: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    requireAuth: vi.fn(),
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/documentos/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentos/access')>();
  return {
    ...actual,
    requireDocumentosPage: mocks.requireDocumentosPage,
  };
});

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      create: mocks.documentCreate,
      updateMany: mocks.documentUpdateMany,
    },
    oneDriveConnection: { findFirst: mocks.connectionFindFirst },
  },
}));

vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: mocks.ensureValidOneDriveAccessToken,
}));

vi.mock('@/lib/onedrive-client', () => ({
  uploadOneDriveFile: mocks.uploadOneDriveFile,
}));

vi.mock('@/lib/documentos/ingest', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentos/ingest')>();
  return {
    ...actual,
    runDocumentosIngest: mocks.runDocumentosIngest,
  };
});

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { POST as uploadPost } from '@/app/api/documentos/upload/route';
import { POST as syncPost } from '@/app/api/documentos/sync/route';
import { PATCH } from '@/app/api/documentos/[id]/route';

const DOC_ID = 'clxdocumentos0000000001';
const PDF_BYTES = new Uint8Array(Buffer.from('%PDF-1.4\n% fixture\n'));

function pdfRequest(fields: Record<string, string> = {}, file?: File) {
  const form = new FormData();
  form.append('kind', fields.kind ?? 'cnd_federal');
  form.append('validUntil', fields.validUntil ?? '2026-12-12');
  form.append(
    'file',
    file ?? new File([PDF_BYTES], 'certidao.pdf', { type: 'application/pdf' }),
  );
  return new Request('http://localhost/api/documentos/upload', { method: 'POST', body: form });
}

describe('POST /api/documentos/upload (SPEC-042 FR-007, AC-009)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'editor',
    });
    mocks.connectionFindFirst.mockResolvedValue({ id: 'conn-1', driveId: 'drive-1' });
    mocks.ensureValidOneDriveAccessToken.mockResolvedValue('token');
    mocks.uploadOneDriveFile.mockResolvedValue({ id: 'item-new', name: 'uploaded.pdf' });
    mocks.documentCreate.mockResolvedValue({
      id: DOC_ID,
      kind: 'cnd_federal',
      fileName: CERTIDAO_UPLOAD_NAME.cnd_federal('12.12.26'),
      oneDriveItemId: 'item-new',
    });
  });

  it('viewer recebe 403 e não toca OneDrive', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await uploadPost(pdfRequest());
    expect(res.status).toBe(403);
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
  });

  it('kind inválido (outro) → 400 sem tocar OneDrive', async () => {
    const res = await uploadPost(pdfRequest({ kind: 'outro' }));
    expect(res.status).toBe(400);
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
    expect(mocks.connectionFindFirst).not.toHaveBeenCalled();
  });

  it('>5 MiB recusado antes de qualquer chamada ao OneDrive', async () => {
    const huge = new Uint8Array(DOCUMENTOS_UPLOAD_MAX_BYTES + 1);
    huge.set(PDF_BYTES);
    const res = await uploadPost(
      pdfRequest({}, new File([huge], 'grande.pdf', { type: 'application/pdf' })),
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
    expect(mocks.connectionFindFirst).not.toHaveBeenCalled();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
    const body = await res.json();
    expect(String(body.error).toLowerCase()).toMatch(/limite|excede/);
  });

  it('sucesso grava no OneDrive com nome padronizado e cria linha manual', async () => {
    const res = await uploadPost(pdfRequest());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validUntilSource).toBe('manual');
    expect(body.oneDriveItemId).toBe('item-new');

    expect(mocks.connectionFindFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-1', accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
    });
    expect(mocks.uploadOneDriveFile).toHaveBeenCalledWith(
      'token',
      'drive-1',
      `${DOCUMENTOS_ONEDRIVE_ROOT}/${CERTIDAO_FOLDER.cnd_federal}`,
      CERTIDAO_UPLOAD_NAME.cnd_federal('12.12.26'),
      expect.any(Buffer),
    );
    expect(mocks.documentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          companyId: 'company-1',
          kind: 'cnd_federal',
          oneDriveItemId: 'item-new',
          oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
          folderName: CERTIDAO_FOLDER.cnd_federal,
          validUntilSource: 'manual',
          fileName: CERTIDAO_UPLOAD_NAME.cnd_federal('12.12.26'),
        }),
      }),
    );
  });

  it('sem conexão nomeada → 409 e não cria linha', async () => {
    mocks.connectionFindFirst.mockResolvedValue(null);
    const res = await uploadPost(pdfRequest());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain(DOCUMENTOS_ONEDRIVE_ACCOUNT);
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
  });
});

describe('POST /api/documentos/sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'editor',
    });
  });

  it('viewer recebe 403', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await syncPost();
    expect(res.status).toBe(403);
    expect(mocks.runDocumentosIngest).not.toHaveBeenCalled();
  });

  it('DocumentosIngestBusyError → 409', async () => {
    mocks.runDocumentosIngest.mockRejectedValue(new DocumentosIngestBusyError());
    const res = await syncPost();
    expect(res.status).toBe(409);
    expect(mocks.runDocumentosIngest).toHaveBeenCalledWith('company-1');
  });

  it('devolve o resultado da ingestão', async () => {
    mocks.runDocumentosIngest.mockResolvedValue({
      scanned: 24,
      upserted: 3,
      removed: 0,
      renewals: [],
    });
    const res = await syncPost();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ scanned: 24, upserted: 3, removed: 0, renewals: [] });
  });
});

describe('PATCH /api/documentos/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'editor',
    });
    mocks.documentUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('viewer recebe 403', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await PATCH(
      new Request('http://localhost/api/documentos/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: '2026-12-31' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(403);
    expect(mocks.documentUpdateMany).not.toHaveBeenCalled();
  });

  it('grava validUntilSource=manual no where { id, companyId }', async () => {
    const res = await PATCH(
      new Request('http://localhost/api/documentos/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: '2026-12-31' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.validUntilSource).toBe('manual');
    expect(body.validUntil).toBe('2026-12-31');

    expect(mocks.documentUpdateMany).toHaveBeenCalledTimes(1);
    const arg = mocks.documentUpdateMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(arg.where).toEqual({ id: DOC_ID, companyId: 'company-1' });
    expect(arg.where).toHaveProperty('companyId', 'company-1');
    expect(arg.data).toEqual(
      expect.objectContaining({ validUntilSource: 'manual' }),
    );
  });

  it('404 se o documento não é da empresa', async () => {
    mocks.documentUpdateMany.mockResolvedValue({ count: 0 });
    const res = await PATCH(
      new Request('http://localhost/api/documentos/x', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ validUntil: '2026-12-31' }),
      }),
      { params: Promise.resolve({ id: DOC_ID }) },
    );
    expect(res.status).toBe(404);
  });
});
