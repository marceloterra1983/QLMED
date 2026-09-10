import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('graph-mail pagination cap', () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => {
    process.env.TENANT_ID = 't';
    process.env.CLIENT_ID = 'c';
    process.env.CLIENT_SECRET = 's';
    vi.resetModules();
    warn.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('para em maxPages e avisa', async () => {
    let pages = 0;
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 });
      }
      pages++;
      return new Response(JSON.stringify({
        value: [{
          id: `m${pages}`,
          internetMessageId: `<${pages}@x>`,
          subject: 's',
          receivedDateTime: '2026-01-01T00:00:00Z',
          hasAttachments: true,
        }],
        '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users/a/messages?$skiptoken=x',
      }), { status: 200 });
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender, GraphMailboxTruncatedError } = await import('@/lib/graph-mail-client');
    const error = await listMailboxMessagesBySender('mb@x', 'from@x', { maxPages: 3 }).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(GraphMailboxTruncatedError);
    const truncated = error as InstanceType<typeof GraphMailboxTruncatedError>;
    expect(truncated.messages).toHaveLength(3);
    expect(truncated.pages).toBe(3);
    expect(pages).toBe(3);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ pages: 3 }),
      'Graph: pagination truncada em maxPages',
    );
  });
});
