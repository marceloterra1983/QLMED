import { describe, expect, it, vi } from 'vitest';
import {
  decideOutOfScopeShadow,
  isAllowedShadowBaseUrl,
  isLoopbackBaseUrl,
  isOutOfScopeShadowEnabled,
  isPatientData,
  outOfScopeShadowQuestions,
  outOfScopeShadowState,
  recordOutOfScopeShadow,
  resolveTrustedShadowHosts,
} from '../out-of-scope-shadow';

describe('outOfScopeShadowState / questions / guard', () => {
  it('state fiel ao bt2: supplier_name + item_descriptions (≤ 120 chars)', () => {
    const state = outOfScopeShadowState({ supplierName: 'AUTOBEL VEICULOS LTDA', description: 'OLEO 5W40' });
    expect(state).toEqual({ supplier_name: 'AUTOBEL VEICULOS LTDA', item_descriptions: ['OLEO 5W40'] });

    const long = outOfScopeShadowState({ supplierName: null, description: 'x'.repeat(200) });
    expect(long.item_descriptions[0]).toHaveLength(120);
  });

  it('pergunta é um Noul com a instrução fiel ao bt2', () => {
    const q = outOfScopeShadowQuestions();
    expect(q.out_of_scope.type).toBe('noul');
    expect(q.out_of_scope.instructions).toContain('other than a medical/hospital product');
  });

  it('guarda de LGPD bloqueia dado de paciente', () => {
    expect(isPatientData(outOfScopeShadowState({ supplierName: null, description: 'PACIENTE A' }))).toBe(true);
    expect(isPatientData(outOfScopeShadowState({ supplierName: 'CONVENIO X', description: 'OLEO' }))).toBe(true);
    expect(isPatientData(outOfScopeShadowState({ supplierName: null, description: 'cpf 123' }))).toBe(true);
    expect(isPatientData(outOfScopeShadowState({ supplierName: 'AUTOBEL', description: 'OLEO' }))).toBe(false);
  });

  it('isOutOfScopeShadowEnabled depende de flag', () => {
    expect(isOutOfScopeShadowEnabled({ enabled: true })).toBe(true);
    expect(isOutOfScopeShadowEnabled({ enabled: false })).toBe(false);
  });

  it('isLoopbackBaseUrl aceita só loopback (127.0.0.1 / localhost / ::1)', () => {
    expect(isLoopbackBaseUrl('http://127.0.0.1:8787')).toBe(true);
    expect(isLoopbackBaseUrl('http://localhost:8787')).toBe(true);
    expect(isLoopbackBaseUrl('http://[::1]:8787')).toBe(true);
    expect(isLoopbackBaseUrl('https://api.example.com')).toBe(false);
    expect(isLoopbackBaseUrl('http://10.0.0.1:8787')).toBe(false);
    expect(isLoopbackBaseUrl('not a url')).toBe(false);
  });

  it('allowlist JEV_TRUSTED_HOSTS: default vazio, sem curinga', () => {
    const previous = process.env.JEV_TRUSTED_HOSTS;
    delete process.env.JEV_TRUSTED_HOSTS;
    try {
      expect(resolveTrustedShadowHosts()).toEqual([]);
      expect(isAllowedShadowBaseUrl('http://100.68.84.119:8787')).toBe(false);
    } finally {
      if (previous === undefined) delete process.env.JEV_TRUSTED_HOSTS;
      else process.env.JEV_TRUSTED_HOSTS = previous;
    }
    expect(resolveTrustedShadowHosts({ trustedHosts: ['100.68.84.119'] })).toEqual(['100.68.84.119']);
    expect(resolveTrustedShadowHosts({ trustedHosts: ['*', '*.example.com'] })).toEqual([]);
  });

  it('100.68.84.119 permitido só se listado; externo sempre recusado', () => {
    expect(isAllowedShadowBaseUrl('http://100.68.84.119:8787', { trustedHosts: ['100.68.84.119'] })).toBe(true);
    expect(isAllowedShadowBaseUrl('http://100.68.84.119:8787', { trustedHosts: [] })).toBe(false);
    expect(isAllowedShadowBaseUrl('https://api.typesafe.ai', { trustedHosts: ['100.68.84.119'] })).toBe(false);
    expect(isAllowedShadowBaseUrl('https://api.typesafe.ai', { trustedHosts: ['api.typesafe.ai'] })).toBe(true);
    expect(isAllowedShadowBaseUrl('http://10.0.0.1:8787', { trustedHosts: ['100.68.84.119'] })).toBe(false);
    expect(isAllowedShadowBaseUrl('http://127.0.0.1:8787', { trustedHosts: [] })).toBe(true);
  });
});

describe('decideOutOfScopeShadow', () => {
  it('chama o notjev /v1/systemone com modelo fixo e devolve noul', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ answers: { out_of_scope: { noul: 0.9987, confidence: 0.9856 } }, model: 'jev-1.13.0' }),
      }) as unknown as Response,
    );

    const decision = await decideOutOfScopeShadow(
      { state: outOfScopeShadowState({ supplierName: 'AUTOBEL', description: 'OLEO' }), questions: outOfScopeShadowQuestions() },
      { baseUrl: 'http://127.0.0.1:8787', fetchImpl },
    );

    expect(decision.noul).toBe(0.9987);
    expect(decision.confidence).toBe(0.9856);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8787/v1/systemone');
    expect(init?.method).toBe('POST');
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe('jev-1.13.0');
    expect(body.state.supplier_name).toBe('AUTOBEL');
    expect(body.questions.out_of_scope.type).toBe('noul');
  });

  it('usa a api key de TYPESAFE_API_KEY / deps.apiKey no header', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      ({ ok: true, status: 200, json: async () => ({ answers: { out_of_scope: { noul: 1, confidence: 1 } } }) }) as unknown as Response,
    );
    await decideOutOfScopeShadow(
      { state: outOfScopeShadowState({ supplierName: 'AUTOBEL', description: 'OLEO' }), questions: outOfScopeShadowQuestions() },
      { baseUrl: 'http://127.0.0.1:8787', apiKey: 'sekret', fetchImpl },
    );
    const [, init] = fetchImpl.mock.calls[0];
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sekret');
  });

  it('fallback: sem TYPESAFE_API_KEY usa "local"', async () => {
    const previous = process.env.TYPESAFE_API_KEY;
    delete process.env.TYPESAFE_API_KEY;
    try {
      const fetchImpl = vi.fn<typeof fetch>(async () =>
        ({ ok: true, status: 200, json: async () => ({ answers: { out_of_scope: { noul: 1 } } }) }) as unknown as Response,
      );
      await decideOutOfScopeShadow(
        { state: outOfScopeShadowState({ supplierName: 'AUTOBEL', description: 'OLEO' }), questions: outOfScopeShadowQuestions() },
        { baseUrl: 'http://127.0.0.1:8787', fetchImpl },
      );
      const [, init] = fetchImpl.mock.calls[0];
      expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer local');
    } finally {
      if (previous === undefined) delete process.env.TYPESAFE_API_KEY;
      else process.env.TYPESAFE_API_KEY = previous;
    }
  });

  it('lança em HTTP não-ok', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      ({ ok: false, status: 500, json: async () => ({}) }) as unknown as Response,
    );
    await expect(
      decideOutOfScopeShadow(
        { state: outOfScopeShadowState({ supplierName: 'X', description: 'Y' }), questions: outOfScopeShadowQuestions() },
        { baseUrl: 'http://127.0.0.1:8787', fetchImpl },
      ),
    ).rejects.toThrow('notjev HTTP 500');
  });
});

describe('recordOutOfScopeShadow', () => {
  it('grava a decisão em JSONL (sombra, não muda a decisão)', async () => {
    const lines: string[] = [];
    const decide = vi.fn(async () => ({ noul: 0.9987, confidence: 0.9856, model: 'jev-1.13.0', latencyMs: 45 }));
    await recordOutOfScopeShadow(
      { supplierName: 'AUTOBEL VEICULOS LTDA', description: 'OLEO 5W40' },
      { enabled: true, decide, appendLine: async (l) => { lines.push(l); } },
    );
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.surface).toBe('nfe_out_of_scope');
    expect(record.noul).toBe(0.9987);
    expect(record.confidence).toBe(0.9856);
    expect(record.error).toBeNull();
    expect(record.stateHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('fail-open: erro do Jev não lança e grava a linha com erro', async () => {
    const lines: string[] = [];
    const decide = vi.fn(async () => { throw new Error('connection refused'); });
    await expect(
      recordOutOfScopeShadow(
        { supplierName: 'TELEFONICA', description: 'SIM CARD' },
        { enabled: true, decide, appendLine: async (l) => { lines.push(l); } },
      ),
    ).resolves.toBeUndefined();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.error).toContain('connection refused');
    expect(record.noul).toBeNull();
  });

  it('LGPD: dado de paciente não chama o Jev', async () => {
    const lines: string[] = [];
    const decide = vi.fn(async () => ({ noul: 0.5, confidence: 1, model: 'jev-1.13.0', latencyMs: 1 }));
    await recordOutOfScopeShadow(
      { supplierName: null, description: 'PACIENTE JOSE' },
      { enabled: true, decide, appendLine: async (l) => { lines.push(l); } },
    );
    expect(decide).not.toHaveBeenCalled();
    expect(JSON.parse(lines[0]).error).toBe('lgpd_blocked');
  });

  it('no-op quando desabilitado', async () => {
    const lines: string[] = [];
    const decide = vi.fn(async () => ({ noul: 0.5, confidence: 1, model: 'jev-1.13.0', latencyMs: 1 }));
    await recordOutOfScopeShadow(
      { supplierName: 'X', description: 'Y' },
      { enabled: false, decide, appendLine: async (l) => { lines.push(l); } },
    );
    expect(decide).not.toHaveBeenCalled();
    expect(lines).toHaveLength(0);
  });

  it('host confiável listado chama o notjev (sem error)', async () => {
    const lines: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      ({ ok: true, status: 200, json: async () => ({ answers: { out_of_scope: { noul: 0.9 } } }) }) as unknown as Response,
    );
    await recordOutOfScopeShadow(
      { supplierName: 'AUTOBEL', description: 'OLEO' },
      { enabled: true, baseUrl: 'http://100.68.84.119:8787', trustedHosts: ['100.68.84.119'], fetchImpl, appendLine: async (l) => { lines.push(l); } },
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines[0]).error).toBeNull();
  });

  it('fail-closed: base externa não chama fetch e grava base_url_nao_local', async () => {
    const lines: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>();
    await recordOutOfScopeShadow(
      { supplierName: 'AUTOBEL', description: 'OLEO' },
      { enabled: true, baseUrl: 'https://api.example.com', fetchImpl, appendLine: async (l) => { lines.push(l); } },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.error).toBe('base_url_nao_local');
    expect(record.noul).toBeNull();
  });

  it('no-op com env ausente (nada é chamado nem gravado)', async () => {
    const previous = process.env.TYPESAFE_BASE_URL;
    delete process.env.TYPESAFE_BASE_URL;
    try {
      const lines: string[] = [];
      const fetchImpl = vi.fn<typeof fetch>();
      await recordOutOfScopeShadow(
        { supplierName: 'AUTOBEL', description: 'OLEO' },
        { fetchImpl, appendLine: async (l) => { lines.push(l); } },
      );
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(lines).toHaveLength(0);
    } finally {
      if (previous === undefined) delete process.env.TYPESAFE_BASE_URL;
      else process.env.TYPESAFE_BASE_URL = previous;
    }
  });

  it('timeout/abort gera record com error (fail-open)', async () => {
    const lines: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>((_url, init) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(new DOMException('The operation was aborted.', 'AbortError')),
        );
      }),
    );
    await recordOutOfScopeShadow(
      { supplierName: 'AUTOBEL', description: 'OLEO' },
      { enabled: true, baseUrl: 'http://127.0.0.1:8787', timeoutMs: 1, fetchImpl, appendLine: async (l) => { lines.push(l); } },
    );
    expect(fetchImpl).toHaveBeenCalled();
    expect(lines).toHaveLength(1);
    const record = JSON.parse(lines[0]);
    expect(record.error).toBeTruthy();
    expect(record.noul).toBeNull();
  });
});
