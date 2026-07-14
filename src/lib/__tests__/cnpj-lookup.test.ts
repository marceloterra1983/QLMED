import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  upsert: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    cnpjCache: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: mocks.logError }),
}));

const CNPJ = '11222333000181';
const apiPayload = {
  cnpj: CNPJ,
  razao_social: 'Empresa Teste',
  nome_fantasia: 'Teste',
  descricao_situacao_cadastral: 'ATIVA',
  cnae_fiscal: 1234,
  cnae_fiscal_descricao: 'Atividade teste',
  uf: 'SP',
};

function fetchOk() {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(apiPayload), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function loadLookup() {
  const globalCache = globalThis as unknown as { cnpjMemoryCache?: unknown };
  delete globalCache.cnpjMemoryCache;
  vi.resetModules();
  return (await import('@/lib/cnpj-lookup')).lookupCnpj;
}

describe('lookupCnpj typed Prisma cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchOk());
    mocks.upsert.mockResolvedValue({});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a cache-valid row without calling BrasilAPI', async () => {
    const cached = {
      cnpj: CNPJ,
      razaoSocial: 'Cache válido',
      nomeFantasia: null,
      situacaoCadastral: 'ATIVA',
      descSituacao: 'ATIVA',
      cnaePrincipal: null,
      porte: null,
      naturezaJuridica: null,
      endereco: {
        logradouro: null,
        numero: null,
        bairro: null,
        municipio: null,
        uf: null,
        cep: null,
      },
      telefone: null,
      email: null,
      capitalSocial: null,
      simplesNacional: null,
      mei: null,
    };
    mocks.findUnique.mockResolvedValue({
      cnpj: CNPJ,
      data: cached,
      fetchedAt: new Date(),
    });

    const lookupCnpj = await loadLookup();
    await expect(lookupCnpj(CNPJ)).resolves.toEqual(cached);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it('ignores an expired row and refreshes it with an upsert', async () => {
    mocks.findUnique.mockResolvedValue({
      cnpj: CNPJ,
      data: { razaoSocial: 'Expirado' },
      fetchedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000),
    });

    const lookupCnpj = await loadLookup();
    const result = await lookupCnpj(CNPJ);

    expect(result?.razaoSocial).toBe('Empresa Teste');
    expect(fetch).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cnpj: CNPJ },
        create: expect.objectContaining({ cnpj: CNPJ }),
        update: expect.objectContaining({ data: expect.any(Object) }),
      }),
    );
  });

  it('uses upsert for a forced refresh without reading the database cache', async () => {
    const lookupCnpj = await loadLookup();
    await expect(lookupCnpj(CNPJ, true)).resolves.toMatchObject({ cnpj: CNPJ });

    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).toHaveBeenCalledOnce();
  });

  it('returns the provider result and logs safely when persistence fails', async () => {
    const dbError = new Error('isolated persistence failure');
    mocks.upsert.mockRejectedValue(dbError);

    const lookupCnpj = await loadLookup();
    await expect(lookupCnpj(CNPJ, true)).resolves.toMatchObject({
      cnpj: CNPJ,
      situacaoCadastral: 'ATIVA',
    });
    expect(mocks.logError).toHaveBeenCalledWith({ err: dbError }, 'Error saving to DB');
  });
});
