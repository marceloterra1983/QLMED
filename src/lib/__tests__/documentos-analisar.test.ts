import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENTOS_UPLOAD_MAX_BYTES } from '@/lib/documentos/constants';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireDocumentosPage: vi.fn(),
  readValidityFromPdf: vi.fn(),
  documentCreate: vi.fn(),
  documentUpdate: vi.fn(),
  uploadOneDriveFile: vi.fn(),
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

vi.mock('@/lib/documentos/pdf-validity', () => ({
  readValidityFromPdf: mocks.readValidityFromPdf,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      create: mocks.documentCreate,
      update: mocks.documentUpdate,
    },
  },
}));

vi.mock('@/lib/onedrive-client', () => ({
  uploadOneDriveFile: mocks.uploadOneDriveFile,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn() }),
}));

import { POST } from '@/app/api/documentos/analisar/route';

const PDF_BYTES = new Uint8Array(Buffer.from('%PDF-1.4\n% fixture\n'));
const ALTA = {
  validUntil: '2026-09-29',
  confidence: 'alta' as const,
  matchedLabel: 'Validade',
  textChars: 40,
};

function pdfRequest(file?: File) {
  const form = new FormData();
  form.append(
    'file',
    file ?? new File([PDF_BYTES], 'certidao.pdf', { type: 'application/pdf' }),
  );
  return new Request('http://localhost/api/documentos/analisar', { method: 'POST', body: form });
}

describe('POST /api/documentos/analisar (SPEC-042 L12)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'editor',
    });
    mocks.readValidityFromPdf.mockResolvedValue(ALTA);
  });

  it('401 sem sessão', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('NOT_AUTHENTICATED'));
    const res = await POST(pdfRequest());
    expect(res.status).toBe(401);
    expect(mocks.readValidityFromPdf).not.toHaveBeenCalled();
  });

  it('403 sem escrita e não lê o PDF', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await POST(pdfRequest());
    expect(res.status).toBe(403);
    expect(mocks.readValidityFromPdf).not.toHaveBeenCalled();
  });

  it('viewer com a página não escreve: 403', async () => {
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'viewer',
    });
    const res = await POST(pdfRequest());
    expect(res.status).toBe(403);
    expect(mocks.readValidityFromPdf).not.toHaveBeenCalled();
  });

  it('não-PDF → 400 e não chama o parser', async () => {
    const res = await POST(pdfRequest(new File(['not-pdf'], 'foto.png', { type: 'image/png' })));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/pdf/i);
    expect(mocks.readValidityFromPdf).not.toHaveBeenCalled();
  });

  it('>5 MB recusado sem parser nem gravação', async () => {
    const huge = new Uint8Array(DOCUMENTOS_UPLOAD_MAX_BYTES + 1);
    huge.set(PDF_BYTES);
    const res = await POST(pdfRequest(new File([huge], 'grande.pdf', { type: 'application/pdf' })));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(mocks.readValidityFromPdf).not.toHaveBeenCalled();
    expect(mocks.documentCreate).not.toHaveBeenCalled();
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
  });

  it('sucesso devolve o PdfValidityResult e não grava nada', async () => {
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(ALTA);
    expect(mocks.readValidityFromPdf).toHaveBeenCalledTimes(1);
    expect(mocks.documentCreate).not.toHaveBeenCalled();
    expect(mocks.documentUpdate).not.toHaveBeenCalled();
    expect(mocks.uploadOneDriveFile).not.toHaveBeenCalled();
  });

  it('PDF sem texto → 200 confidence nenhuma, não é 500', async () => {
    mocks.readValidityFromPdf.mockResolvedValue({
      validUntil: null,
      confidence: 'nenhuma',
      matchedLabel: null,
      textChars: 0,
    });
    const res = await POST(pdfRequest());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      validUntil: null,
      confidence: 'nenhuma',
      matchedLabel: null,
      textChars: 0,
    });
  });
});
