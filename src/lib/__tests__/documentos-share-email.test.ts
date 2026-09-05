import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT } from '@/lib/documentos/constants';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireDocumentosPage: vi.fn(),
  documentFindFirst: vi.fn(),
  connectionFindFirst: vi.fn(),
  ensureValidOneDriveAccessToken: vi.fn(),
  openOneDriveItemContent: vi.fn(),
  sendMail: vi.fn(),
  loggedErrors: [] as Array<{ payload: unknown; msg?: string }>,
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({ sendMail: mocks.sendMail })),
  },
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
    error: (payload: unknown, msg?: string) => {
      mocks.loggedErrors.push({ payload, msg });
    },
    warn: vi.fn(),
    info: vi.fn(),
  }),
}));

import {
  DOCUMENTOS_SHARE_RECIPIENTS,
  resolveDocumentosShareRecipients,
  shareDocumentByEmail,
  ShareRecipientsNotAllowedError,
} from '@/lib/documentos/share-email';
import { POST } from '@/app/api/documentos/[id]/compartilhar/route';
import { DOCUMENTOS_UPLOAD_MAX_BYTES } from '@/lib/documentos/constants';

const DOC_ID = 'clxdocumentos0000000001';
const FILE_NAME = 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf';
const PDF_BYTES = Buffer.from('%PDF-1.7 conteudo-da-certidao');
const SMTP_PASS_SAVED = process.env.SMTP_PASS;

function pdfStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

function shareRequest(body: unknown, id = DOC_ID) {
  return POST(
    new Request(`http://localhost/api/documentos/${id}/compartilhar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe('DOCUMENTOS_SHARE_RECIPIENTS', () => {
  it('exporta a lista ordenada com rótulo para a tela', () => {
    expect(DOCUMENTOS_SHARE_RECIPIENTS.map((row) => row.email)).toEqual([
      'faturamento@qlmed.com.br',
      'marcelo@qlmed.com.br',
      'daniele@qlmed.com.br',
      'flavio@qlmed.com.br',
      'joseroberto@qlmed.com.br',
    ]);
    expect(DOCUMENTOS_SHARE_RECIPIENTS.every((row) => row.label.length > 0)).toBe(true);
  });
});

describe('resolveDocumentosShareRecipients', () => {
  it('aceita e-mail da lista e índice, recusa o resto', () => {
    expect(resolveDocumentosShareRecipients(['marcelo@qlmed.com.br', '0'])).toEqual({
      ok: true,
      emails: ['marcelo@qlmed.com.br', 'faturamento@qlmed.com.br'],
    });
    expect(resolveDocumentosShareRecipients(['outsider@evil.com'])).toEqual({ ok: false });
    expect(resolveDocumentosShareRecipients(['99'])).toEqual({ ok: false });
    expect(resolveDocumentosShareRecipients([])).toEqual({ ok: false });
  });
});

describe('shareDocumentByEmail', () => {
  const baseInput = {
    recipients: ['faturamento@qlmed.com.br'],
    fileName: FILE_NAME,
    pdf: PDF_BYTES,
    kindLabel: 'CND Receita Federal',
    validUntil: '2026-12-12' as string | null,
  };

  it('envia o PDF em anexo com assunto e corpo em português', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: '<id@mail>' });
    const result = await shareDocumentByEmail(baseInput, { transport: { sendMail } });

    expect(result).toEqual({ sent: ['faturamento@qlmed.com.br'], messageId: '<id@mail>' });
    expect(sendMail).toHaveBeenCalledTimes(1);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toBe('[QL MED] CND Receita Federal — validade 12/12/2026');
    expect(mail.text).toContain('CND Receita Federal');
    expect(mail.text).toContain('12/12/2026');
    expect(mail.html).toBeUndefined();
    expect(mail.attachments).toEqual([
      {
        filename: FILE_NAME,
        content: PDF_BYTES,
        contentType: 'application/pdf',
      },
    ]);
    expect(String(mail.from)).toMatch(/QL MED/);
    expect(String(mail.from)).toContain('adm@qlmed.com.br');
  });

  it('assunto usa — sem data quando validUntil é null', async () => {
    const sendMail = vi.fn().mockResolvedValue({ messageId: 'x' });
    await shareDocumentByEmail(
      { ...baseInput, validUntil: null },
      { transport: { sendMail } },
    );
    expect(sendMail.mock.calls[0][0].subject).toBe('[QL MED] CND Receita Federal — sem data');
    expect(sendMail.mock.calls[0][0].text).toContain('Validade: sem data.');
  });

  it('coloca a nota só no corpo texto, sem HTML', async () => {
    const sendMail = vi.fn().mockResolvedValue({});
    await shareDocumentByEmail(
      { ...baseInput, note: '<script>alert(1)</script> conferir validade' },
      { transport: { sendMail } },
    );
    const mail = sendMail.mock.calls[0][0];
    expect(mail.html).toBeUndefined();
    expect(mail.text).toContain('<script>alert(1)</script> conferir validade');
    expect(mail.subject).not.toContain('script');
  });

  it('recusa destinatário fora da lista sem chamar o transport', async () => {
    const sendMail = vi.fn();
    await expect(
      shareDocumentByEmail(
        { ...baseInput, recipients: ['atacante@evil.com'] },
        { transport: { sendMail } },
      ),
    ).rejects.toBeInstanceOf(ShareRecipientsNotAllowedError);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('lança erro claro se SMTP_PASS não estiver configurado (sem transport injetado)', async () => {
    delete process.env.SMTP_PASS;
    await expect(shareDocumentByEmail(baseInput)).rejects.toThrow(
      'SMTP_PASS não configurado no servidor',
    );
  });
});

describe('POST /api/documentos/[id]/compartilhar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loggedErrors.length = 0;
    process.env.SMTP_PASS = 'test-smtp-pass';
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.requireDocumentosPage.mockResolvedValue({
      ok: true,
      companyId: 'company-1',
      userId: 'user-1',
      role: 'editor',
    });
    mocks.documentFindFirst.mockResolvedValue({
      id: DOC_ID,
      fileName: FILE_NAME,
      oneDriveItemId: 'item-1',
      kind: 'cnd_federal',
      validUntil: new Date('2026-12-12T00:00:00.000Z'),
    });
    mocks.connectionFindFirst.mockResolvedValue({ id: 'conn-1', driveId: 'drive-1' });
    mocks.ensureValidOneDriveAccessToken.mockResolvedValue('token');
    mocks.openOneDriveItemContent.mockResolvedValue({
      body: pdfStream(PDF_BYTES),
      size: PDF_BYTES.length,
    });
    mocks.sendMail.mockResolvedValue({ messageId: '<msg@qlmed>' });
  });

  it('401 sem sessão', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('NOT_AUTHENTICATED'));
    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });
    expect(res.status).toBe(401);
    expect(mocks.openOneDriveItemContent).not.toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('403 sem a página / viewer', async () => {
    mocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });
    expect(res.status).toBe(403);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('404 se o documento não existe', async () => {
    mocks.documentFindFirst.mockResolvedValue(null);
    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });
    expect(res.status).toBe(404);
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('anti-relay: e-mail arbitrário do corpo é recusado com 400', async () => {
    const res = await shareRequest({ recipients: ['atacante@evil.com'] });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/não permitido/i);
    expect(JSON.stringify(body)).not.toContain('atacante@evil.com');
    expect(mocks.sendMail).not.toHaveBeenCalled();
    expect(mocks.openOneDriveItemContent).not.toHaveBeenCalled();
  });

  it('envia o PDF em anexo e devolve sent', async () => {
    const res = await shareRequest({
      recipients: ['Faturamento@qlmed.com.br', '2'],
      note: 'Segue para o processo.',
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      sent: ['faturamento@qlmed.com.br', 'daniele@qlmed.com.br'],
    });
    expect(mocks.documentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: DOC_ID, companyId: 'company-1' } }),
    );
    expect(mocks.connectionFindFirst).toHaveBeenCalledWith({
      where: { companyId: 'company-1', accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
    });
    expect(mocks.sendMail).toHaveBeenCalledTimes(1);
    const mail = mocks.sendMail.mock.calls[0][0];
    expect(mail.attachments).toEqual([
      {
        filename: FILE_NAME,
        content: expect.any(Buffer),
        contentType: 'application/pdf',
      },
    ]);
    expect(Buffer.compare(mail.attachments[0].content, PDF_BYTES)).toBe(0);
    expect(mail.text).toContain('Segue para o processo.');
  });

  it('SMTP falha → 502 genérico e logger nao vaza o segredo (sanitizeError)', async () => {
    const secret = 'SuperSecretPassXYZ-nao-e-jwt';
    mocks.sendMail.mockRejectedValue(
      new Error(`SMTP auth failed password=${secret} accessToken=AbC123SegredoQueNaoEJwt`),
    );

    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe('Falha ao enviar e-mail');
    const dumped = JSON.stringify({ body, logs: mocks.loggedErrors });
    expect(dumped).not.toContain(secret);
    expect(dumped).not.toContain('AbC123SegredoQueNaoEJwt');
    expect(dumped).toContain('password=[redacted]');
    expect(dumped).toContain('accessToken=[redacted]');
  });
  /**
   * A rota irmã `[id]/arquivo` faz stream e nunca materializa; esta precisa do
   * conteúdo em memória para o anexar. Sem teto isso é risco de PROCESSO, não
   * de pedido: o contentor corre com `mem_limit: 1g` e a materialização tem
   * pico de ~3x, portanto algumas centenas de MB derrubam a aplicação inteira.
   * E o alvo existe: os `BALANÇO <ano>.zip` viram linhas com oneDriveItemId, e
   * esta é a única rota que os materializa.
   */
  it('413 e não materializa quando o Content-Length passa do teto', async () => {
    const cancel = vi.fn(async () => {});
    mocks.openOneDriveItemContent.mockResolvedValue({
      body: { cancel } as unknown as ReadableStream<Uint8Array>,
      size: DOCUMENTOS_UPLOAD_MAX_BYTES + 1,
    });

    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });

    expect(res.status).toBe(413);
    expect(cancel).toHaveBeenCalled();
    expect(mocks.sendMail).not.toHaveBeenCalled();
  });

  it('exatamente no teto ainda passa', async () => {
    mocks.openOneDriveItemContent.mockResolvedValue({
      body: pdfStream(PDF_BYTES),
      size: DOCUMENTOS_UPLOAD_MAX_BYTES,
    });
    const res = await shareRequest({ recipients: ['faturamento@qlmed.com.br'] });
    expect(res.status).toBe(200);
    expect(mocks.sendMail).toHaveBeenCalled();
  });
});

afterAll(() => {
  if (SMTP_PASS_SAVED === undefined) delete process.env.SMTP_PASS;
  else process.env.SMTP_PASS = SMTP_PASS_SAVED;
});
