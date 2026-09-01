import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CASSEMS_MAILBOXES, CASSEMS_SENDER_EMAILS } from '@/lib/cassems/constants';

/**
 * SPEC-036: a coleta aceita o remetente OPME além do ofício antigo e
 * une as listagens por internetMessageId.
 */

const OFICIO = 'oficio.cconecte@cassems.com.br';
const MAILING = 'mailing.opme@cassems.com.br';

describe('CASSEMS_SENDER_EMAILS', () => {
  it('mantém a caixa joseroberto e os dois remetentes', () => {
    expect([...CASSEMS_MAILBOXES]).toEqual(['joseroberto@qlmed.com.br']);
    expect([...CASSEMS_SENDER_EMAILS]).toEqual([OFICIO, MAILING]);
  });
});

describe('listMailboxMessagesBySenders', () => {
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

  function installFetch(bySender: Record<string, Array<Record<string, string>>>) {
    const requested: string[] = [];
    globalThis.fetch = vi.fn(async (url: unknown) => {
      const href = String(url);
      if (href.includes('login.microsoftonline.com')) {
        return new Response(JSON.stringify({ access_token: 'token', expires_in: 3600 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      const fromMatch = decodeURIComponent(href).match(
        /from\/emailAddress\/address eq '([^']+)'/i,
      );
      const sender = fromMatch?.[1] ?? '';
      requested.push(sender);
      const rows = bySender[sender] ?? [];
      return new Response(JSON.stringify({ value: rows }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
    return requested;
  }

  it('lista o remetente OPME e o ofício antigo', async () => {
    const requested = installFetch({
      [MAILING]: [
        {
          id: 'graph-opme',
          internetMessageId: '<opme@cassems>',
          subject: 'Oficio OPME',
          receivedDateTime: '2026-08-30T12:00:00.000Z',
        },
      ],
      [OFICIO]: [
        {
          id: 'graph-oficio',
          internetMessageId: '<oficio@cassems>',
          subject: 'Oficio CConecte',
          receivedDateTime: '2026-08-29T12:00:00.000Z',
        },
      ],
    });

    const { listMailboxMessagesBySenders } = await import('@/lib/graph-mail-client');
    const messages = await listMailboxMessagesBySenders(
      'joseroberto@qlmed.com.br',
      [OFICIO, MAILING],
      {},
    );

    expect(requested).toEqual(expect.arrayContaining([OFICIO, MAILING]));
    expect(messages.map((row) => row.internetMessageId).sort()).toEqual([
      '<oficio@cassems>',
      '<opme@cassems>',
    ]);
  });

  it('deduplica por internetMessageId quando os dois filtros devolvem a mesma mensagem', async () => {
    const shared = {
      id: 'graph-shared',
      internetMessageId: '<shared@cassems>',
      subject: 'Oficio duplicado',
      receivedDateTime: '2026-08-30T15:00:00.000Z',
    };
    installFetch({
      [MAILING]: [shared],
      [OFICIO]: [{ ...shared, id: 'graph-shared-other' }],
    });

    const { listMailboxMessagesBySenders } = await import('@/lib/graph-mail-client');
    const messages = await listMailboxMessagesBySenders(
      'joseroberto@qlmed.com.br',
      [OFICIO, MAILING],
      {},
    );

    expect(messages).toHaveLength(1);
    expect(messages[0]?.internetMessageId).toBe('<shared@cassems>');
  });
});
