import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  fetchAnvisaData: vi.fn(),
  getProductRegistryWithAnvisa: vi.fn(),
  getProductRegistryByKeys: vi.fn(),
  updateRegistryAnvisaData: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/anvisa-api', () => ({ fetchAnvisaData: mocks.fetchAnvisaData }));
vi.mock('@/lib/product-registry-store', () => ({
  getProductRegistryWithAnvisa: mocks.getProductRegistryWithAnvisa,
  getProductRegistryByKeys: mocks.getProductRegistryByKeys,
  updateRegistryAnvisaData: mocks.updateRegistryAnvisaData,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const ROW = {
  id: 'r1',
  anvisaCode: '1234567',
  anvisaMatchedProductName: null,
  anvisaHolder: null,
  anvisaProcess: null,
  anvisaStatus: null,
  anvisaExpiration: null,
  anvisaRiskClass: null,
  anvisaManufacturer: null,
  anvisaManufacturerCountry: null,
};

function postAll() {
  return new Request('http://localhost/api/products/anvisa/sync-registry', {
    method: 'POST',
    body: JSON.stringify({ mode: 'all' }),
    headers: { 'content-type': 'application/json' },
  });
}

describe('POST /api/products/anvisa/sync-registry — falha vs 404', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.getProductRegistryWithAnvisa.mockResolvedValue([ROW]);
    mocks.updateRegistryAnvisaData.mockResolvedValue(undefined);
  });

  it('HTTP 500 não grava anvisaSyncedAt', async () => {
    mocks.fetchAnvisaData.mockResolvedValue({ found: false, data: null, error: 'HTTP 500' });
    const { POST } = await import('@/app/api/products/anvisa/sync-registry/route');
    const res = await POST(postAll());
    const json = await res.json();
    expect(json.failed).toBe(1);
    expect(json.notFound).toBe(0);
    expect(mocks.updateRegistryAnvisaData).not.toHaveBeenCalled();
  });

  it('404 grava syncedAt como não encontrado', async () => {
    mocks.fetchAnvisaData.mockResolvedValue({ found: false, data: null, error: null });
    const { POST } = await import('@/app/api/products/anvisa/sync-registry/route');
    const res = await POST(postAll());
    const json = await res.json();
    expect(json.notFound).toBe(1);
    expect(json.failed).toBe(0);
    expect(mocks.updateRegistryAnvisaData).toHaveBeenCalled();
    expect(mocks.updateRegistryAnvisaData.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        anvisaStatus: 'Não encontrado na ANVISA',
        anvisaSyncedAt: expect.any(Date),
      }),
    );
  });
});
