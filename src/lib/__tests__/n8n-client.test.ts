import { describe, it, expect, vi } from 'vitest';
import { fetchN8nWorkflows, parseWorkflows } from '@/lib/n8n-client';

const CONN = { baseUrl: 'https://n8n.example', apiToken: 'chave-de-teste' };

/** Resposta HTTP simulada, sem rede e sem n8n. */
function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function rejectingFetch(err: Error): typeof fetch {
  return (() => Promise.reject(err)) as unknown as typeof fetch;
}

// ---------------------------------------------------------------------------
// Caminhos de FALHA primeiro, por escolha: o risco central desta feature não é
// mostrar status errado, é mostrar saúde quando não se sabe. Nenhum destes
// casos pode devolver `ok`, e nenhum precisa de chave ou de n8n no ar.
// ---------------------------------------------------------------------------
describe('fetchN8nWorkflows — falhas', () => {
  it('sem credencial: not_configured, não unavailable', async () => {
    const r = await fetchN8nWorkflows(null);
    expect(r.state).toBe('not_configured');
    if (r.state === 'not_configured') expect(r.reason).toBe('missing_credential');
  });

  it('baseUrl sem token também é not_configured', async () => {
    const r = await fetchN8nWorkflows({ baseUrl: 'https://n8n.example', apiToken: null });
    expect(r.state).toBe('not_configured');
  });

  it('tempo limite estourado vira unavailable/timeout', async () => {
    const err = new Error('timed out');
    err.name = 'TimeoutError';
    const r = await fetchN8nWorkflows(CONN, rejectingFetch(err));
    expect(r.state).toBe('unavailable');
    if (r.state === 'unavailable') expect(r.reason).toBe('timeout');
  });

  it('conexão recusada vira unavailable/network', async () => {
    const r = await fetchN8nWorkflows(CONN, rejectingFetch(new TypeError('fetch failed')));
    expect(r.state).toBe('unavailable');
    if (r.state === 'unavailable') expect(r.reason).toBe('network');
  });

  it('500 vira unavailable/http_error', async () => {
    const r = await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({}, 500))) as unknown as typeof fetch);
    expect(r.state).toBe('unavailable');
    if (r.state === 'unavailable') expect(r.reason).toBe('http_error');
  });

  it('401 vira not_configured/rejected_credential — a ação é configurar, não investigar', async () => {
    const r = await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({}, 401))) as unknown as typeof fetch);
    expect(r.state).toBe('not_configured');
    if (r.state === 'not_configured') expect(r.reason).toBe('rejected_credential');
  });

  it('resposta 200 com formato inesperado vira unavailable/invalid_response', async () => {
    const r = await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({ inesperado: true }))) as unknown as typeof fetch);
    expect(r.state).toBe('unavailable');
    if (r.state === 'unavailable') expect(r.reason).toBe('invalid_response');
  });

  it('NENHUM caminho de falha devolve workflows — a prova da User Story 2', async () => {
    const timeout = new Error('t'); timeout.name = 'TimeoutError';
    const resultados = [
      await fetchN8nWorkflows(null),
      await fetchN8nWorkflows(CONN, rejectingFetch(timeout)),
      await fetchN8nWorkflows(CONN, rejectingFetch(new TypeError('fetch failed'))),
      await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({}, 500))) as unknown as typeof fetch),
      await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({}, 401))) as unknown as typeof fetch),
      await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse({ lixo: 1 }))) as unknown as typeof fetch),
    ];
    for (const r of resultados) {
      expect(r.state).not.toBe('ok');
      expect(r).not.toHaveProperty('workflows');
    }
  });

  it('não confunde not_configured com unavailable — ações diferentes', async () => {
    const semChave = await fetchN8nWorkflows(null);
    const fora = await fetchN8nWorkflows(CONN, rejectingFetch(new TypeError('fetch failed')));
    expect(semChave.state).not.toBe(fora.state);
  });

  it('nunca lança — toda falha vira estado', async () => {
    const explosivo = (() => { throw new Error('boom'); }) as unknown as typeof fetch;
    await expect(fetchN8nWorkflows(CONN, explosivo)).resolves.toBeDefined();
  });
});

describe('fetchN8nWorkflows — sucesso', () => {
  it('resposta válida devolve ok com os workflows e o instante da consulta', async () => {
    const body = { data: [{ id: '1', name: 'Sync NF-e', active: true }] };
    const r = await fetchN8nWorkflows(CONN, (() => Promise.resolve(jsonResponse(body))) as unknown as typeof fetch);
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.workflows).toEqual([{ id: '1', name: 'Sync NF-e', active: true }]);
      expect(r.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('manda a chave no cabeçalho X-N8N-API-KEY, verificado por sondagem da API real', async () => {
    const spy = vi.fn(() => Promise.resolve(jsonResponse({ data: [] })));
    await fetchN8nWorkflows(CONN, spy as unknown as typeof fetch);
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-N8N-API-KEY']).toBe('chave-de-teste');
  });
});

describe('parseWorkflows', () => {
  it('lista vazia é resultado válido, não erro', () => {
    expect(parseWorkflows({ data: [] })).toEqual([]);
  });

  it('recusa a resposta inteira se UM item estiver malformado — nunca lista parcial', () => {
    const payload = { data: [{ id: '1', name: 'ok', active: true }, { id: '2', name: 'sem active' }] };
    expect(parseWorkflows(payload)).toBeNull();
  });

  it('recusa payload sem envelope data', () => {
    expect(parseWorkflows({ workflows: [] })).toBeNull();
    expect(parseWorkflows(null)).toBeNull();
    expect(parseWorkflows('texto')).toBeNull();
  });

  it('aceita id numérico, normalizando para string', () => {
    expect(parseWorkflows({ data: [{ id: 7, name: 'n', active: false }] })).toEqual([
      { id: '7', name: 'n', active: false },
    ]);
  });
});
