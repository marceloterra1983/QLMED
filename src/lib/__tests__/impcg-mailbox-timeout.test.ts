import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * O orçamento de IMPCG_MAILBOX_TIMEOUT_MS vale por requisição HTTP.
 * Um orçamento por caixa aborta a coleta inteira quando o histórico da caixa
 * exige muitas páginas, que foi a falha observada em produção
 * ("The operation was aborted due to timeout").
 */

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
}));

describe('graph-mail-client: timeout por requisição', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    process.env.TENANT_ID = 'tenant';
    process.env.CLIENT_ID = 'client';
    process.env.CLIENT_SECRET = 'secret';
    vi.resetModules();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('usa um signal distinto por página da listagem paginada', async () => {
    const seenSignals: Array<AbortSignal | null | undefined> = [];
    let page = 0;

    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      seenSignals.push(init?.signal);
      page += 1;
      const body =
        page < 3
          ? {
              value: [
                {
                  id: `graph-${page}`,
                  internetMessageId: `<msg-${page}@compras>`,
                  subject: `OF ${page}`,
                  receivedDateTime: '2023-08-10T15:00:00.000Z',
                  hasAttachments: true,
                },
              ],
              '@odata.nextLink': `https://graph.microsoft.com/v1.0/next-${page}`,
            }
          : { value: [] };

      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender } = await import('@/lib/graph-mail-client');
    const messages = await listMailboxMessagesBySender('caixa@qlmed.com.br', 'compras.impcg@gmail.com', {});

    expect(messages).toHaveLength(2);
    expect(seenSignals).toHaveLength(3);

    const unique = new Set(seenSignals);
    expect(unique.size).toBe(seenSignals.length);
  });

  it('respeita cancelamento externo já abortado', async () => {
    globalThis.fetch = vi.fn(async (url: unknown, init?: RequestInit) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (init?.signal?.aborted) {
        throw new DOMException('This operation was aborted', 'AbortError');
      }
      return new Response(JSON.stringify({ value: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;

    const { listMailboxMessagesBySender } = await import('@/lib/graph-mail-client');

    await expect(
      listMailboxMessagesBySender('caixa@qlmed.com.br', 'compras.impcg@gmail.com', {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
  });
});

describe('runImpcgIngest: orçamento não é por caixa', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('não reutiliza o mesmo signal entre listagem e download de anexos', async () => {
    const listSignals: Array<AbortSignal | undefined> = [];
    const attachmentSignals: Array<AbortSignal | undefined> = [];

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');

    await runImpcgIngest('co1', {
      mail: {
        async listMessages(_mailbox, options) {
          listSignals.push(options?.signal);
          return [
            {
              graphMessageId: 'graph-1',
              internetMessageId: `<msg-${listSignals.length}@compras>`,
              subject: 'OF 17673',
              receivedAt: new Date('2023-08-10T15:00:00.000Z'),
              hasAttachments: true,
            },
          ];
        },
        async getPdfAttachments(_mailbox, _graphMessageId, signal) {
          attachmentSignals.push(signal);
          return [];
        },
      },
      drive: { uploadPdf: vi.fn(async () => ({ itemId: 'od-1' })) },
      extractText: vi.fn(async () => ''),
      store: {
        async findSourceByInternetMessageId() {
          return null;
        },
        async findByOficioNumber() {
          return null;
        },
        async persistConfirmed() {
          return { id: 'auth-1' };
        },
        async persistIssuedAt() {},
        async persistUpgrade() {},
        async persistSourceOnly() {},
        async loadIngestState() {
          return null;
        },
        async saveIngestState() {},
      },
    });

    expect(attachmentSignals.length).toBeGreaterThan(0);

    const shared = attachmentSignals.filter(
      (signal) => signal !== undefined && listSignals.includes(signal),
    );
    expect(shared).toHaveLength(0);
  });
});
