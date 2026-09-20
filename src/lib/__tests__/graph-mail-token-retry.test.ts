import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const warn = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function graphMessage() {
  return {
    value: [{
      id: 'm1',
      internetMessageId: '<1@x>',
      subject: 's',
      receivedDateTime: '2026-01-01T00:00:00Z',
      hasAttachments: true,
    }],
  };
}

describe('graph-mail token retry', () => {
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

  it('401 no Graph pede token novo e conclui a listagem', async () => {
    let tokenCalls = 0;
    let graphCalls = 0;
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        tokenCalls += 1;
        return new Response(
          JSON.stringify({ access_token: `token-${tokenCalls}`, expires_in: 3600 }),
          { status: 200 },
        );
      }
      graphCalls += 1;
      if (graphCalls === 1) {
        return new Response(
          JSON.stringify({
            error: {
              code: 'InvalidAuthenticationToken',
              message: 'Lifetime validation failed, the token is expired.',
            },
          }),
          { status: 401 },
        );
      }
      return new Response(JSON.stringify(graphMessage()), { status: 200 });
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender } = await import('@/lib/graph-mail-client');
    const messages = await listMailboxMessagesBySender('mb@x', 'from@x');
    expect(messages).toHaveLength(1);
    expect(tokenCalls).toBe(2);
    expect(graphCalls).toBe(2);
  });

  it('401 persistente após token novo continua mailbox_forbidden', async () => {
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ error: { code: 'InvalidAuthenticationToken', message: 'token is expired' } }),
        { status: 401 },
      );
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender, GraphMailboxError } = await import('@/lib/graph-mail-client');
    const error = await listMailboxMessagesBySender('mb@x', 'from@x').then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(GraphMailboxError);
    expect((error as InstanceType<typeof GraphMailboxError>).message).toBe('mailbox_forbidden');
    const graphCalls = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([url]) => !String(url).includes('login.microsoftonline.com'),
    );
    expect(graphCalls).toHaveLength(2);
  });
});
