import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetchAnvisaData — distinção de falha', () => {
  it('404 → found:false, error:null (não encontrado)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 404, json: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r).toEqual({ found: false, data: null, error: null });
  });

  it('HTTP 500 → found:false, error:string (falha do serviço)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500, json: vi.fn() });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(false);
    expect(r.error).toMatch(/HTTP 500/);
  });

  it('rede/timeout → found:false, error:string', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('fetch failed'));
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(false);
    expect(r.error).toBe('fetch failed');
  });

  it('resposta 200 com item no dataset saude → found:true, dataset saude', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        content: [{ numeroRegistro: '1234567', nomeProduto: 'X', nomeEmpresa: 'Y' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(true);
    expect(r.data?.nomeProduto).toBe('X');
    expect(r.data?.nomeEmpresa).toBe('Y');
    expect(r.data?.dataset).toBe('saude');
    expect(r.error).toBeNull();
  });

  it('resposta 200 vazia → found:false, error:null (não encontrado)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ content: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r).toEqual({ found: false, data: null, error: null });
  });

  it('200 com content não-array é falha, não throw', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ content: { numeroRegistro: '1234567' } }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(false);
    expect(r.error).toMatch(/JSON/i);
  });

  it('saude 200 só com descricaoProduto preenche nomeProduto', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        content: [{ numeroRegistro: '1234567', descricaoProduto: 'Stent coronário' }],
      }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(true);
    expect(r.data?.dataset).toBe('saude');
    expect(r.data?.nomeProduto).toBe('Stent coronário');
  });

  it('medicamentos não copia classe terapêutica para classeRisco', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 404, json: vi.fn() })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          content: [{ numeroRegistro: '1234567', produto: 'Dipirona', classe: 'Analgésico' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(true);
    expect(r.data?.dataset).toBe('medicamentos');
    expect(r.data?.nomeProduto).toBe('Dipirona');
    expect(r.data?.classeRisco).toBeNull();
  });

  it('falha de rede no primeiro dataset NUNCA cai no segundo', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue({}) });
    vi.stubGlobal('fetch', fetchMock);
    const { fetchAnvisaData } = await import('@/lib/anvisa-api');
    const r = await fetchAnvisaData('1234567');
    expect(r.found).toBe(false);
    expect(r.error).toBe('timeout');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
