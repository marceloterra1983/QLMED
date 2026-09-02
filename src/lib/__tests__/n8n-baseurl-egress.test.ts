import { describe, it, expect, vi } from 'vitest';
import { fetchN8nWorkflows, resolveN8nHost } from '@/lib/n8n-client';

describe('INT-011 — baseUrl do n8n não pode desviar a chave', () => {
  it.each([
    ['http:// em claro', 'http://n8n.qlmed.com.br'],
    ['loopback', 'https://127.0.0.1:5678'],
    ['metadados de nuvem', 'https://169.254.169.254'],
    ['rede interna', 'https://10.0.0.5'],
    ['credenciais na URL', 'https://user:senha@n8n.qlmed.com.br'],
    ['string que não é URL', 'n8n.qlmed.com.br'],
  ])('recusa %s — vira estado, sem lançar e sem chamar fetch', async (_label, baseUrl) => {
    const fetchMock = vi.fn();

    const result = await fetchN8nWorkflows({ baseUrl, apiToken: 'chave' }, fetchMock);

    expect(result).toEqual({ state: 'not_configured', reason: 'missing_credential' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolveN8nHost devolve o host para https público e null para o resto', () => {
    expect(resolveN8nHost('https://n8n.qlmed.com.br/')).toBe('n8n.qlmed.com.br');
    expect(resolveN8nHost('http://n8n.qlmed.com.br')).toBeNull();
    expect(resolveN8nHost('https://127.0.0.1')).toBeNull();
    expect(resolveN8nHost('')).toBeNull();
  });

  it('aceita https público e mantém toda requisição no host gravado', async () => {
    // Uma Response nova por chamada: o corpo só pode ser lido uma vez, e esta
    // função faz duas requisições (workflows e executions).
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const result = await fetchN8nWorkflows(
      { baseUrl: 'https://n8n.qlmed.com.br', apiToken: 'chave' },
      fetchMock,
    );

    expect(result.state).toBe('ok');
    expect(fetchMock).toHaveBeenCalled();
    for (const [url] of fetchMock.mock.calls) {
      const parsed = new URL(url as string);
      expect(parsed.hostname).toBe('n8n.qlmed.com.br');
      expect(parsed.protocol).toBe('https:');
    }
  });
});
