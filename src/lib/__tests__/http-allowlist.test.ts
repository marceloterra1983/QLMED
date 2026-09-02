import { describe, expect, it, vi, afterEach } from 'vitest';
import { assertAllowedHost } from '@/lib/http-allowlist';
import { oneDriveGraphJsonRequest } from '@/lib/onedrive-graph';
import { listMailboxMessagesBySender } from '@/lib/graph-mail-client';

const GRAPH = ['graph.microsoft.com'];

describe('assertAllowedHost — contrato de egresso', () => {
  it('devolve a URL parseada quando host e esquema conferem', () => {
    const url = assertAllowedHost('https://graph.microsoft.com/v1.0/me?$top=5', GRAPH);
    expect(url).toBeInstanceOf(URL);
    expect(url.hostname).toBe('graph.microsoft.com');
    expect(url.searchParams.get('$top')).toBe('5');
  });

  it('recusa esquema que não seja https', () => {
    expect(() => assertAllowedHost('http://graph.microsoft.com/v1.0/me', GRAPH)).toThrow(
      /não é https/,
    );
    expect(() => assertAllowedHost('file:///etc/passwd', GRAPH)).toThrow(/não é https/);
    expect(() => assertAllowedHost('data:text/plain,x', GRAPH)).toThrow(/não é https/);
  });

  it('recusa string que não parseia como URL absoluta', () => {
    expect(() => assertAllowedHost('/v1.0/me', GRAPH)).toThrow(/inválida/);
    expect(() => assertAllowedHost('', GRAPH)).toThrow(/inválida/);
  });

  it('recusa host fora da allowlist', () => {
    expect(() => assertAllowedHost('https://evil.example/v1.0/me', GRAPH)).toThrow(
      /fora da allowlist/,
    );
  });

  it('não trata a allowlist como sufixo — subdomínio forjado não passa', () => {
    expect(() => assertAllowedHost('https://graph.microsoft.com.evil.test/x', GRAPH)).toThrow(
      /fora da allowlist/,
    );
    expect(() => assertAllowedHost('https://evil-graph.microsoft.com/x', GRAPH)).toThrow(
      /fora da allowlist/,
    );
  });

  it('recusa credenciais embutidas mesmo com host permitido', () => {
    expect(() =>
      assertAllowedHost('https://user:senha@graph.microsoft.com/v1.0/me', GRAPH),
    ).toThrow(/credenciais embutidas/);
  });

  it('allowlist vazia recusa tudo (fail-closed)', () => {
    expect(() => assertAllowedHost('https://graph.microsoft.com/v1.0/me', [])).toThrow(
      /fora da allowlist/,
    );
  });

  it('compara host sem distinguir maiúsculas nem ponto final do FQDN', () => {
    expect(assertAllowedHost('https://GRAPH.microsoft.com/v1.0/me', GRAPH).hostname).toBe(
      'graph.microsoft.com',
    );
    // O ponto final do FQDN não impede o casamento; a URL devolvida é a do
    // chamador, não uma reescrita dela.
    expect(assertAllowedHost('https://graph.microsoft.com./v1.0/me', GRAPH).hostname).toBe(
      'graph.microsoft.com.',
    );
    expect(assertAllowedHost('https://graph.microsoft.com/x', ['Graph.Microsoft.COM'])).toBeInstanceOf(
      URL,
    );
  });

  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '172.16.0.9',
    '192.168.1.1',
    '169.254.169.254', // metadados de nuvem
    '100.64.0.1',
    '0.0.0.0',
  ])('recusa IPv4 privado/loopback %s mesmo estando na allowlist', (ip) => {
    expect(() => assertAllowedHost(`https://${ip}/v1.0/me`, [ip])).toThrow(
      /privado ou loopback/,
    );
  });

  it.each(['[::1]', '[fe80::1]', '[fc00::1]', '[::ffff:127.0.0.1]'])(
    'recusa IPv6 privado/loopback %s mesmo estando na allowlist',
    (bracketed) => {
      const host = bracketed.slice(1, -1);
      expect(() => assertAllowedHost(`https://${bracketed}/v1.0/me`, [host])).toThrow(
        /privado ou loopback/,
      );
    },
  );

  it('aceita IPv4 público que esteja na allowlist', () => {
    expect(assertAllowedHost('https://8.8.8.8/x', ['8.8.8.8']).hostname).toBe('8.8.8.8');
  });

  it('recusa octeto com zero à esquerda, que o SO leria como octal', () => {
    // 0177.0.0.1 é 127.0.0.1 para o resolvedor; aqui nem chega a ser IP válido.
    expect(() => assertAllowedHost('https://0177.0.0.1/x', ['0177.0.0.1'])).toThrow(
      /fora da allowlist|privado ou loopback/,
    );
  });

  it('porta não permitida na allowlist não confunde a comparação de host', () => {
    expect(assertAllowedHost('https://graph.microsoft.com:8443/x', GRAPH).port).toBe('8443');
  });
});

describe('INT-009 — nextLink absoluto do Graph não pode levar o Bearer embora', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('recusa nextLink apontando para outro host ANTES de chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      oneDriveGraphJsonRequest('token-secreto', 'https://attacker.test/v1.0/me'),
    ).rejects.toThrow(/fora da allowlist/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('recusa nextLink para loopback (SSRF interno) ANTES de chamar fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      oneDriveGraphJsonRequest('token-secreto', 'http://127.0.0.1:3000/api/admin'),
    ).rejects.toThrow(/não é https|privado ou loopback/);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('segue nextLink absoluto legítimo do próprio Graph', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ value: [] }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await oneDriveGraphJsonRequest('token', 'https://graph.microsoft.com/v1.0/me?$skiptoken=abc');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me?$skiptoken=abc',
      expect.objectContaining({
        headers: { Authorization: 'Bearer token', Accept: 'application/json' },
      }),
    );
  });

  it('mantém o caminho relativo funcionando (sem regressão)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ id: 'item-1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await oneDriveGraphJsonRequest('token', '/me');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me',
      expect.anything(),
    );
  });
});

describe('INT-009 — o mesmo buraco existia no cliente de e-mail do Graph', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.TENANT_ID;
    delete process.env.CLIENT_ID;
    delete process.env.CLIENT_SECRET;
  });

  it('recusa nextLink para outro host em vez de reenviar o Bearer', async () => {
    process.env.TENANT_ID = 'tenant';
    process.env.CLIENT_ID = 'client';
    process.env.CLIENT_SECRET = 'secret';

    const fetchMock = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('login.microsoftonline.com')) {
        return new Response(
          JSON.stringify({ access_token: 'token-secreto', expires_in: 3600 }),
          { status: 200 },
        );
      }
      if (url.startsWith('https://graph.microsoft.com')) {
        // O Graph "devolve" uma próxima página em outro host.
        return new Response(
          JSON.stringify({ value: [], '@odata.nextLink': 'https://attacker.test/next' }),
          { status: 200 },
        );
      }
      throw new Error(`token vazou para ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      listMailboxMessagesBySender('caixa@qlmed.com.br', 'remetente@x.test'),
    ).rejects.toThrow(/fora da allowlist/);

    const hosts = fetchMock.mock.calls.map(([u]) => new URL(u as string).hostname);
    expect(hosts).not.toContain('attacker.test');
  });
});
