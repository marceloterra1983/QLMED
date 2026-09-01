import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_PDF_BYTES } from '@/lib/pdf/ocr-limits';

/**
 * L5/G14c (re-auditoria): o teto de bytes do anexo do Graph em
 * `listImpcgPdfAttachments` recusa pelo comprimento do base64, ANTES de
 * `Buffer.from` alocar. Nenhum teste chegava lá — `pdf-ocr-limits.test.ts`
 * exercita o outro call site (extract-pdf-text). Aqui o anexo grande tem de
 * ser descartado sem decodificação nenhuma, e o pequeno tem de passar.
 */

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn, error: vi.fn(), info: vi.fn() }),
}));

// Base64 gasta 4 chars por 3 bytes; +8 chars garante ficar acima do teto.
const OVER_CAP_B64_LENGTH = Math.ceil((MAX_PDF_BYTES * 4) / 3) + 8;
const SMALL_PDF_B64 = Buffer.from('%PDF-1.4\n% pequeno\n').toString('base64');

function graphFetch(attachments: Array<Record<string, unknown>>) {
  return vi.fn(async (url: unknown) => {
    const href = String(url);
    if (href.includes('login.microsoftonline.com')) {
      return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({ value: attachments }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
}

const spyBufferFrom = () => vi.spyOn(Buffer, 'from');
type BufferFromSpy = ReturnType<typeof spyBufferFrom>;

function base64Decodes(spy: BufferFromSpy) {
  // `Buffer.from` é sobrecarregado; o tipo das chamadas fica no 1º overload.
  return (spy.mock.calls as unknown[][]).filter((call) => call[1] === 'base64');
}

function fileAttachment(name: string, contentBytes: string) {
  return {
    '@odata.type': '#microsoft.graph.fileAttachment',
    name,
    contentType: 'application/pdf',
    contentBytes,
  };
}

describe('graph-mail-client: teto do anexo antes de materializar o Buffer', () => {
  const originalFetch = globalThis.fetch;
  let bufferFrom: BufferFromSpy;

  beforeEach(() => {
    process.env.TENANT_ID = 'tenant';
    process.env.CLIENT_ID = 'client';
    process.env.CLIENT_SECRET = 'secret';
    vi.resetModules();
    warn.mockClear();
    bufferFrom = spyBufferFrom();
  });

  afterEach(() => {
    bufferFrom.mockRestore();
    globalThis.fetch = originalFetch;
  });

  it('anexo acima do teto é descartado sem nenhum Buffer.from(_, "base64")', async () => {
    globalThis.fetch = graphFetch([fileAttachment('grande.pdf', 'A'.repeat(OVER_CAP_B64_LENGTH))]);

    const { listImpcgPdfAttachments } = await import('@/lib/graph-mail-client');
    bufferFrom.mockClear();
    const pdfs = await listImpcgPdfAttachments('caixa@qlmed.com.br', 'msg-1');

    expect(pdfs).toEqual([]);
    expect(base64Decodes(bufferFrom)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'grande.pdf', limit: MAX_PDF_BYTES }),
      'attachment_too_large',
    );
    const { approxBytes } = warn.mock.calls[0][0] as { approxBytes: number };
    expect(approxBytes).toBeGreaterThan(MAX_PDF_BYTES);
  });

  it('anexo abaixo do teto é decodificado (controlo do próprio teste)', async () => {
    globalThis.fetch = graphFetch([fileAttachment('pequeno.pdf', SMALL_PDF_B64)]);

    const { listImpcgPdfAttachments } = await import('@/lib/graph-mail-client');
    bufferFrom.mockClear();
    const pdfs = await listImpcgPdfAttachments('caixa@qlmed.com.br', 'msg-2');

    expect(pdfs).toHaveLength(1);
    expect(pdfs[0].content.toString('utf8')).toMatch(/^%PDF-1\.4/);
    expect(base64Decodes(bufferFrom)).toHaveLength(1);
    expect(warn).not.toHaveBeenCalled();
  });

  it('o grande não contamina o pequeno na mesma mensagem', async () => {
    globalThis.fetch = graphFetch([
      fileAttachment('grande.pdf', 'A'.repeat(OVER_CAP_B64_LENGTH)),
      fileAttachment('pequeno.pdf', SMALL_PDF_B64),
    ]);

    const { listImpcgPdfAttachments } = await import('@/lib/graph-mail-client');
    bufferFrom.mockClear();
    const pdfs = await listImpcgPdfAttachments('caixa@qlmed.com.br', 'msg-3');

    expect(pdfs.map((p) => p.name)).toEqual(['pequeno.pdf']);
    expect(base64Decodes(bufferFrom)).toHaveLength(1);
  });
});
