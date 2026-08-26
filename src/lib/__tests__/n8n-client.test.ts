import { describe, it, expect, vi } from 'vitest';
import { fetchN8nWorkflows } from '@/lib/n8n-client';

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

/**
 * O cliente faz DUAS chamadas: workflows e execuções. Este auxiliar responde a
 * cada uma pela URL, para os testes de sucesso refletirem o fluxo real.
 */
function routedFetch(
  workflowsBody: unknown,
  executionsBody: unknown,
  onCall?: (url: string) => void,
): typeof fetch {
  return ((url: string) => {
    onCall?.(url);
    const body = url.includes('/executions') ? executionsBody : workflowsBody;
    return Promise.resolve(jsonResponse(body));
  }) as unknown as typeof fetch;
}

describe('fetchN8nWorkflows — sucesso', () => {
  it('casa workflow com sua última execução', async () => {
    const r = await fetchN8nWorkflows(
      CONN,
      routedFetch(
        { data: [{ id: '1', name: 'Sync NF-e', active: true }] },
        { data: [{ id: '99', workflowId: '1', status: 'success', startedAt: '2026-08-26T10:00:00Z', stoppedAt: '2026-08-26T10:00:05Z' }] },
      ),
    );
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.workflows[0].lastExecution?.outcome).toBe('success');
      expect(r.workflows[0].lastExecution?.id).toBe('99');
      expect(r.fetchedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    }
  });

  it('workflow sem execução alguma tem lastExecution null — nunca executado', async () => {
    const r = await fetchN8nWorkflows(
      CONN,
      routedFetch({ data: [{ id: '1', name: 'Novo', active: true }] }, { data: [] }),
    );
    expect(r.state).toBe('ok');
    if (r.state === 'ok') expect(r.workflows[0].lastExecution).toBeNull();
  });

  it('escolhe a execução de startedAt mais recente, não a primeira da lista', async () => {
    const r = await fetchN8nWorkflows(
      CONN,
      routedFetch(
        { data: [{ id: '1', name: 'W', active: true }] },
        { data: [
          { id: 'antiga', workflowId: '1', status: 'success', startedAt: '2026-08-20T10:00:00Z' },
          { id: 'nova', workflowId: '1', status: 'error', startedAt: '2026-08-26T10:00:00Z' },
        ] },
      ),
    );
    if (r.state === 'ok') {
      expect(r.workflows[0].lastExecution?.id).toBe('nova');
      expect(r.workflows[0].lastExecution?.outcome).toBe('failure');
    }
  });

  // O achado de T012: só success e error foram observados, mas o n8n emite
  // outros. Um status novo NÃO pode derrubar a consulta.
  it('status desconhecido não invalida a resposta — degrada para unknown', async () => {
    const r = await fetchN8nWorkflows(
      CONN,
      routedFetch(
        { data: [{ id: '1', name: 'W', active: true }] },
        { data: [{ id: '5', workflowId: '1', status: 'status_que_nao_existia_ainda', startedAt: '2026-08-26T10:00:00Z' }] },
      ),
    );
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.workflows[0].lastExecution?.outcome).toBe('unknown');
      expect(r.workflows[0].lastExecution?.rawStatus).toBe('status_que_nao_existia_ainda');
    }
  });

  it('ignora campos pesados que a API traz e a tela não usa', async () => {
    const r = await fetchN8nWorkflows(
      CONN,
      routedFetch(
        { data: [{ id: '1', name: 'W', active: true, nodes: [{}, {}], staticData: { x: 1 }, connections: {} }] },
        { data: [] },
      ),
    );
    if (r.state === 'ok') {
      expect(r.workflows[0]).not.toHaveProperty('nodes');
      expect(r.workflows[0]).not.toHaveProperty('staticData');
    }
  });

  it('manda a chave no cabeçalho X-N8N-API-KEY, confirmado contra a API real', async () => {
    const spy = vi.fn(() => Promise.resolve(jsonResponse({ data: [] })));
    await fetchN8nWorkflows(CONN, spy as unknown as typeof fetch);
    const [, init] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['X-N8N-API-KEY']).toBe('chave-de-teste');
  });
});

// ---------------------------------------------------------------------------
// Paginação: o defeito latente que T012 revelou. nextCursor é paginação REAL e
// a primeira versão do cliente a ignorava, o que produziria lista incompleta
// sem sinal nenhum de estar incompleta.
// ---------------------------------------------------------------------------
describe('fetchN8nWorkflows — paginação', () => {
  it('segue nextCursor até o fim e junta as páginas', async () => {
    let call = 0;
    const impl = ((url: string) => {
      if (url.includes('/executions')) return Promise.resolve(jsonResponse({ data: [] }));
      call++;
      return Promise.resolve(jsonResponse(
        call === 1
          ? { data: [{ id: '1', name: 'A', active: true }], nextCursor: 'c2' }
          : { data: [{ id: '2', name: 'B', active: false }], nextCursor: null },
      ));
    }) as unknown as typeof fetch;

    const r = await fetchN8nWorkflows(CONN, impl);
    expect(r.state).toBe('ok');
    if (r.state === 'ok') {
      expect(r.workflows.map((w) => w.id)).toEqual(['1', '2']);
      expect(r.truncated).toBe(false);
    }
  });

  it('repassa o cursor recebido na requisição seguinte', async () => {
    const urls: string[] = [];
    let call = 0;
    const impl = ((url: string) => {
      urls.push(url);
      if (url.includes('/executions')) return Promise.resolve(jsonResponse({ data: [] }));
      call++;
      return Promise.resolve(jsonResponse(
        call === 1 ? { data: [], nextCursor: 'CURSOR_ESPERADO' } : { data: [], nextCursor: null },
      ));
    }) as unknown as typeof fetch;

    await fetchN8nWorkflows(CONN, impl);
    expect(urls.some((u) => u.includes('cursor=CURSOR_ESPERADO'))).toBe(true);
  });

  it('atingido o teto de páginas, declara truncated — nunca incompleto em silêncio', async () => {
    const impl = ((url: string) => Promise.resolve(jsonResponse(
      url.includes('/executions')
        ? { data: [], nextCursor: null }
        : { data: [{ id: 'x', name: 'W', active: true }], nextCursor: 'sempre-tem-mais' },
    ))) as unknown as typeof fetch;

    const r = await fetchN8nWorkflows(CONN, impl);
    expect(r.state).toBe('ok');
    if (r.state === 'ok') expect(r.truncated).toBe(true);
  });

  it('falha na segunda chamada (execuções) derruba tudo para unavailable', async () => {
    const impl = ((url: string) => {
      if (url.includes('/executions')) return Promise.resolve(jsonResponse({}, 500));
      return Promise.resolve(jsonResponse({ data: [{ id: '1', name: 'W', active: true }] }));
    }) as unknown as typeof fetch;

    const r = await fetchN8nWorkflows(CONN, impl);
    expect(r.state).toBe('unavailable');
    expect(r).not.toHaveProperty('workflows');
  });
});
