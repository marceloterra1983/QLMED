import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/n8n/route';
import { createWebhookSignature } from '@/lib/n8n-webhook-security';

// O nonce passou a viver no Postgres (INT-003). Estes testes exercitam
// roteamento e assinatura, não repetição: um store que sempre concede mantém o
// foco, e cada teste usa um nonce distinto.
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $executeRaw: async (strings: TemplateStringsArray) =>
      strings.join('?').includes('INSERT') ? 1 : 0,
  },
}));


const fetchMock = vi.fn();

function request(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/n8n', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'test-key',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

/**
 * Requisição assinada. Existe porque o webhook passou a ser fail-CLOSED: antes,
 * estes testes de roteamento passavam sem assinatura nenhuma, apoiados no
 * `if (!secret) return true` — ou seja, exercitavam o defeito.
 */
let nonceCounter = 0;
function signedRequest(body: unknown, secret = 'shared-secret'): NextRequest {
  process.env.N8N_WEBHOOK_SECRET = secret;
  const rawBody = JSON.stringify(body);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = `nonce-route-auto-${++nonceCounter}`;
  return request(body, {
    'x-qlmed-timestamp': timestamp,
    'x-qlmed-nonce': nonce,
    'x-qlmed-signature': createWebhookSignature(secret, timestamp, nonce, rawBody),
  });
}

describe('n8n webhook forwarding', () => {
  beforeEach(() => {
    process.env.QLMED_API_KEY = 'test-key';
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    delete process.env.QLMED_API_KEY;
    delete process.env.N8N_WEBHOOK_SECRET;
    vi.unstubAllGlobals();
  });

  it('requires a fresh HMAC signature when the webhook secret is configured', async () => {
    process.env.N8N_WEBHOOK_SECRET = 'shared-secret';
    const body = { action: 'notify', payload: { id: '1' } };
    const rawBody = JSON.stringify(body);
    const timestamp = String(Math.floor(Date.now() / 1000));
    const nonce = 'nonce-route-1';
    const signature = createWebhookSignature(process.env.N8N_WEBHOOK_SECRET, timestamp, nonce, rawBody);

    const response = await POST(request(body, {
      'x-qlmed-timestamp': timestamp,
      'x-qlmed-nonce': nonce,
      'x-qlmed-signature': signature,
    }));

    expect(response.status).toBe(200);
  });

  it('rejects unsigned webhook requests when the secret is configured', async () => {
    process.env.N8N_WEBHOOK_SECRET = 'shared-secret';

    const response = await POST(request({ action: 'notify' }));

    expect(response.status).toBe(401);
  });

  it('routes sync-cte through the NSDocs sync handler and preserves downstream errors', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));

    const response = await POST(signedRequest({ action: 'sync-cte', payload: { ignored: true } }));

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, action: 'sync-cte' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/api/nsdocs/sync',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ ignored: true, method: 'nsdocs' }),
      }),
    );
  });

  it('uses the upload route field name expected by the multipart parser', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    const response = await POST(signedRequest({
      action: 'process-xml',
      payload: { xml: Buffer.from('<CTe/>').toString('base64') },
    }));

    expect(response.status).toBe(200);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const formData = init.body as FormData;
    expect(formData.get('files')).toBeInstanceOf(File);
    expect(formData.get('file')).toBeNull();
  });
});
