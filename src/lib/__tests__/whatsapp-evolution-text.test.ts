import { afterEach, describe, expect, it, vi } from 'vitest';

describe('sendWhatsAppText', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('POSTs sendText with number and text', async () => {
    const fetchMock = vi.fn(
      async (): Promise<Response> =>
        new Response(JSON.stringify({ key: { id: 'm1' } }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const { sendWhatsAppText } = await import('@/lib/whatsapp-evolution');
    const result = await sendWhatsAppText(
      { jid: '120363411914746947@g.us', text: 'olá' },
      { baseUrl: 'https://evolution.qlmed.com.br', instance: 'qlmed', apiKey: 'k' },
    );
    expect(result.messageId).toBe('m1');
    expect(fetchMock).toHaveBeenCalledOnce();
    const call = fetchMock.mock.calls[0] as unknown as [string | URL, RequestInit];
    expect(String(call[0])).toContain('/message/sendText/qlmed');
    expect(JSON.parse(String(call[1]?.body))).toEqual({
      number: '120363411914746947@g.us',
      text: 'olá',
    });
  });
});
