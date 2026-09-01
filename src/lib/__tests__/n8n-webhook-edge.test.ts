import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/n8n/route';
import { createWebhookSignature } from '@/lib/n8n-webhook-security';

const fetchMock = vi.fn();

function signedHeaders(secret: string, rawBody: string, nonce: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'x-qlmed-timestamp': timestamp,
    'x-qlmed-nonce': nonce,
    'x-qlmed-signature': createWebhookSignature(secret, timestamp, nonce, rawBody),
  };
}

function request(rawBody: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/n8n', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': 'test-key', ...headers },
    body: rawBody,
  });
}

describe('INT-001 — borda do webhook n8n', () => {
  beforeEach(() => {
    process.env.QLMED_API_KEY = 'test-key';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  });

  afterEach(() => {
    delete process.env.QLMED_API_KEY;
    delete process.env.N8N_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
  });

  describe('HMAC fail-closed', () => {
    it('sem secret configurado o webhook RECUSA (era fail-open)', async () => {
      delete process.env.N8N_WEBHOOK_SECRET;
      const rawBody = JSON.stringify({ action: 'notify', payload: { id: '1' } });

      const response = await POST(request(rawBody));

      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ error: 'Invalid webhook signature' });
    });

    it('sem secret, nem uma assinatura bem formada é aceita — nada é encaminhado', async () => {
      delete process.env.N8N_WEBHOOK_SECRET;
      const rawBody = JSON.stringify({ action: 'sync-nfe' });

      const response = await POST(
        request(rawBody, signedHeaders('qualquer-segredo', rawBody, 'nonce-sem-secret')),
      );

      expect(response.status).toBe(401);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('com secret configurado e assinatura válida, segue normalmente', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
      const rawBody = JSON.stringify({ action: 'notify', payload: { id: '2' } });

      const response = await POST(
        request(rawBody, signedHeaders('shared-secret', rawBody, 'nonce-edge-ok')),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('teto de corpo', () => {
    it('recusa com 413 quando o content-length declarado passa do teto', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'shared-secret';

      const response = await POST(
        request(JSON.stringify({ action: 'notify' }), {
          'content-length': String(64 * 1024 * 1024),
        }),
      );

      expect(response.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('recusa com 413 pelo tamanho REAL, mesmo sem content-length honesto', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
      // 9 MiB de corpo real: acima de MAX_BODY_BYTES (8 MiB).
      const huge = JSON.stringify({ action: 'notify', payload: { x: 'a'.repeat(9 * 1024 * 1024) } });

      const response = await POST(request(huge, { 'content-length': '10' }));

      expect(response.status).toBe(413);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('corpo dentro do teto continua passando', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
      const rawBody = JSON.stringify({ action: 'notify', payload: { x: 'a'.repeat(1024) } });

      const response = await POST(
        request(rawBody, signedHeaders('shared-secret', rawBody, 'nonce-edge-small')),
      );

      expect(response.status).toBe(200);
    });
  });

  describe('timeout do forward interno', () => {
    it('todo forward carrega AbortSignal', async () => {
      process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
      const rawBody = JSON.stringify({ action: 'sync-nfe', payload: {} });

      await POST(request(rawBody, signedHeaders('shared-secret', rawBody, 'nonce-edge-timeout')));

      expect(fetchMock).toHaveBeenCalledWith(
        'http://127.0.0.1:3000/api/nsdocs/sync',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });
  });
});
