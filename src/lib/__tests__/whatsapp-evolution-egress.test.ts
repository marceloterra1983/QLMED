import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getEvolutionConfig, sendWhatsAppDocument } from '@/lib/whatsapp-evolution';

const BASE_OK = 'https://evo.qlmed.com.br';

function setEnv(baseUrl: string) {
  process.env.EVO_API_URL = baseUrl;
  process.env.EVO_INSTANCE = 'qlmed';
  process.env.EVO_API_KEY = 'chave-secreta';
}

describe('INT-012 — EVO_API_URL sem allowlist', () => {
  beforeEach(() => {
    delete process.env.EVO_API_URL;
    delete process.env.QLMED_EVOLUTION_BASE_URL;
    delete process.env.EVO_INSTANCE;
    delete process.env.EVO_API_KEY;
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each([
    ['http:// em claro', 'http://evil'],
    ['host interno', 'https://127.0.0.1:8080'],
    ['metadados de nuvem', 'https://169.254.169.254'],
    ['rede privada', 'https://192.168.0.10'],
    ['credenciais na URL', 'https://user:senha@evo.qlmed.com.br'],
    ['string que não é URL', 'evo.qlmed.com.br'],
  ])('desliga o canal quando o endereço é %s', (_label, baseUrl) => {
    setEnv(baseUrl);

    // Desligar (null) em vez de lançar: uma variável má não pode derrubar o
    // envio de uma nota fiscal, do mesmo modo que uma variável em falta.
    expect(getEvolutionConfig()).toBeNull();
  });

  it('aceita https público e mantém a configuração', () => {
    setEnv(BASE_OK);

    expect(getEvolutionConfig()).toEqual({
      baseUrl: BASE_OK,
      instance: 'qlmed',
      apiKey: 'chave-secreta',
    });
  });

  it('o envio recusa um baseUrl que passe por baixo da configuração', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      sendWhatsAppDocument(
        { jid: '5567999999999', fileName: 'nf.pdf', content: Buffer.from('x'), caption: 'c' },
        { baseUrl: 'http://evil', instance: 'qlmed', apiKey: 'chave-secreta' },
      ),
    ).rejects.toThrow(/egresso/i);

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('não segue redirect — a apikey e o PDF não saltam de host', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ key: { id: 'm1' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sendWhatsAppDocument(
      { jid: '5567999999999', fileName: 'nf.pdf', content: Buffer.from('x'), caption: 'c' },
      { baseUrl: BASE_OK, instance: 'qlmed', apiKey: 'chave-secreta' },
    );

    const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(new URL(url).hostname).toBe('evo.qlmed.com.br');
    expect(init.redirect).toBe('error');
  });
});
