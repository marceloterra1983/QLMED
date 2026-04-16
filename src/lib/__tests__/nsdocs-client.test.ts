import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NsdocsClient, NsdocsTransientError, NsdocsPaginationError } from '../nsdocs-client';

function mockResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  const status = init.status ?? 200;
  const headers = new Headers(init.headers || {});
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return new Response(bodyStr, { status, headers });
}

describe('NsdocsClient', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('listarTodosDocumentos pagination hardening', () => {
    it('throws NsdocsPaginationError when API returns non-array on first page', async () => {
      const fetchMock = vi.fn().mockResolvedValue(mockResponse({ erro: 'rate limited' }));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      await expect(client.listarTodosDocumentos()).rejects.toBeInstanceOf(NsdocsPaginationError);
    });

    it('throws NsdocsPaginationError when API returns non-array mid-pagination', async () => {
      const page1 = Array.from({ length: 100 }, (_, i) => ({ id: `doc-${i}`, chave_acesso: '', tipo: 'NFE' }));
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(page1))
        .mockResolvedValueOnce(mockResponse({ unexpected: 'shape' }));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      await expect(client.listarTodosDocumentos()).rejects.toBeInstanceOf(NsdocsPaginationError);
    });

    it('returns accumulated docs when final page has fewer than pageSize rows', async () => {
      const full = Array.from({ length: 100 }, (_, i) => ({ id: `a-${i}`, chave_acesso: '', tipo: 'NFE' }));
      const tail = Array.from({ length: 7 }, (_, i) => ({ id: `b-${i}`, chave_acesso: '', tipo: 'NFE' }));
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse(full))
        .mockResolvedValueOnce(mockResponse(tail));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      const result = await client.listarTodosDocumentos();
      expect(result.length).toBe(107);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('throws NsdocsPaginationError when maxPages is exhausted with more results pending', async () => {
      // Always return a fresh full-page Response — forces the loop to keep requesting.
      const page = Array.from({ length: 100 }, (_, i) => ({ id: `x-${i}`, chave_acesso: '', tipo: 'NFE' }));
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(mockResponse(page)));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      await expect(client.listarTodosDocumentos()).rejects.toBeInstanceOf(NsdocsPaginationError);
      expect(fetchMock).toHaveBeenCalledTimes(50); // hits cap exactly
    });
  });

  describe('retry + backoff', () => {
    it('retries on 429 and succeeds when a later attempt returns 200', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(mockResponse('slow down', { status: 429, headers: { 'retry-after': '0' } }))
        .mockResolvedValueOnce(mockResponse([{ id: 'ok', chave_acesso: '', tipo: 'NFE' }]));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      const docs = await client.listarDocumentos();
      expect(docs.length).toBe(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('retries on 503 up to the retry budget and then throws NsdocsTransientError', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(mockResponse('unavailable', { status: 503 })));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      await expect(client.recuperarXml('doc-123')).rejects.toBeInstanceOf(NsdocsTransientError);
      expect(fetchMock).toHaveBeenCalledTimes(3); // MAX_RETRIES
    });

    it('does NOT retry on 400', async () => {
      const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(mockResponse('bad req', { status: 400 })));
      vi.stubGlobal('fetch', fetchMock);
      const client = new NsdocsClient('tok');
      await expect(client.listarDocumentos()).rejects.toThrow(/NSDocs API error \(400\)/);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
