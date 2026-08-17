import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from '@/app/api/webhooks/n8n/route';

const fetchMock = vi.fn();

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/webhooks/n8n', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': 'test-key',
    },
    body: JSON.stringify(body),
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
    vi.unstubAllGlobals();
  });

  it('routes sync-cte through the NSDocs sync handler and preserves downstream errors', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: 'unavailable' }), { status: 503 }));

    const response = await POST(request({ action: 'sync-cte', payload: { ignored: true } }));

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

    const response = await POST(request({
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
