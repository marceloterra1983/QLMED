import { describe, expect, it } from 'vitest';
import { PayloadTooLargeError, readBodyWithLimit, formDataWithLimit } from '@/lib/upload-limits';

const LIMIT = 64 * 1024;

/**
 * Corpo hostil: um stream que produz bytes sem fim e conta quantos entregou.
 * Se o limite for aplicado só depois de bufferizar, este teste nunca termina
 * (ou termina depois de o processo comer toda a memória) — que é exatamente o
 * defeito FILE-001.
 */
function endlessBody(chunkSize = 8 * 1024) {
  const counter = { delivered: 0, cancelled: false };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      counter.delivered += chunkSize;
      // Trava de segurança do próprio teste: se o guard falhar, falha rápido.
      if (counter.delivered > 50 * 1024 * 1024) {
        controller.error(new Error('guard nunca cortou o stream'));
        return;
      }
      controller.enqueue(new Uint8Array(chunkSize));
    },
    cancel() {
      counter.cancelled = true;
    },
  });
  return { stream, counter };
}

function request(body: BodyInit | ReadableStream, headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/upload', {
    method: 'POST',
    body: body as BodyInit,
    headers,
    // Node exige duplex para stream de request.
    ...({ duplex: 'half' } as Record<string, unknown>),
  });
}

describe('readBodyWithLimit (FILE-001)', () => {
  it('recusa corpo maior que o cap SEM Content-Length (chunked)', async () => {
    const { stream, counter } = endlessBody();
    const req = request(stream);
    expect(req.headers.get('content-length')).toBeNull();

    await expect(readBodyWithLimit(req, LIMIT)).rejects.toBeInstanceOf(PayloadTooLargeError);

    // O corte é no stream: nada de bufferizar o corpo inteiro primeiro.
    expect(counter.delivered).toBeLessThanOrEqual(LIMIT + 8 * 1024);
    expect(counter.cancelled).toBe(true);
  });

  it('recusa quando Content-Length declara acima do cap, sem ler o corpo', async () => {
    const { stream, counter } = endlessBody();
    const req = request(stream, { 'content-length': String(LIMIT * 10) });

    await expect(readBodyWithLimit(req, LIMIT)).rejects.toBeInstanceOf(PayloadTooLargeError);
    // O construtor de Request já puxa um chunk sozinho; o guard não puxa mais
    // nenhum — recusa pelo header antes de tocar no stream.
    expect(counter.delivered).toBeLessThanOrEqual(8 * 1024);
  });

  it('recusa mesmo quando o cliente MENTE no Content-Length', async () => {
    const { stream, counter } = endlessBody();
    const req = request(stream, { 'content-length': '10' });

    await expect(readBodyWithLimit(req, LIMIT)).rejects.toBeInstanceOf(PayloadTooLargeError);
    expect(counter.delivered).toBeLessThanOrEqual(LIMIT + 8 * 1024);
  });

  it('aceita corpo dentro do cap e devolve os bytes intactos', async () => {
    const payload = new Uint8Array(1024).fill(7);
    const bytes = await readBodyWithLimit(request(payload), LIMIT);

    expect(bytes.byteLength).toBe(1024);
    expect(bytes.every((b) => b === 7)).toBe(true);
  });

  it('formDataWithLimit continua parseando multipart normal', async () => {
    const form = new FormData();
    form.set('file', new File(['<xml/>'], 'nota.xml', { type: 'text/xml' }));

    const parsed = await formDataWithLimit(request(form), LIMIT);
    const file = parsed.get('file') as File;

    expect(file.name).toBe('nota.xml');
    await expect(file.text()).resolves.toBe('<xml/>');
  });
});
