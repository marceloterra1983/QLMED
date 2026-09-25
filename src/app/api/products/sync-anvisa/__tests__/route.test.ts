import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  findMany: vi.fn(),
  upsertProductRegistry: vi.fn(),
  resolveAnvisaByCodeAndName: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({ getOrCreateSingleCompany: mocks.getOrCreateSingleCompany }));
vi.mock('@/lib/prisma', () => ({ default: { productRegistry: { findMany: mocks.findMany } } }));
vi.mock('@/lib/product-registry-store', () => ({ upsertProductRegistry: mocks.upsertProductRegistry }));
vi.mock('@/lib/anvisa-open-data', () => ({
  resolveAnvisaByCodeAndName: mocks.resolveAnvisaByCodeAndName,
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

const PRODUCT = {
  productKey: 'k1',
  code: 'ABC',
  description: 'Seringa descartável 10ml',
  ncm: null,
  unit: null,
  ean: null,
  anvisaCode: null,
  anvisaSource: null,
  anvisaConfidence: null,
  anvisaMatchedProductName: null,
  anvisaHolder: null,
  anvisaProcess: null,
  anvisaStatus: null,
  anvisaSyncedAt: null,
};

function post(mode: 'all' | 'missing') {
  return new Request('http://localhost/api/products/sync-anvisa', {
    method: 'POST',
    body: JSON.stringify({ mode }),
    headers: { 'content-type': 'application/json' },
  });
}

function match(method: 'catalog_name' | 'catalog_code_exact') {
  return {
    registration: '80123456789',
    method,
    confidence: 0.7,
    matchedProductName: 'SERINGA',
    holder: 'X',
    process: null,
    status: 'Válido',
    source: 'catalog',
  };
}

describe('POST /api/products/sync-anvisa — só código exato grava registro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.findMany.mockResolvedValue([PRODUCT]);
    mocks.upsertProductRegistry.mockResolvedValue(undefined);
  });

  it.each(['missing', 'all'] as const)('match por nome vira sugestão e não grava anvisaCode (%s)', async (mode) => {
    mocks.resolveAnvisaByCodeAndName.mockResolvedValue(match('catalog_name'));
    const { POST } = await import('@/app/api/products/sync-anvisa/route');
    const json = await (await POST(post(mode))).json();

    expect(json.stats.nameSuggestions).toBe(1);
    expect(json.stats.updated).toBe(0);
    for (const [row] of mocks.upsertProductRegistry.mock.calls) {
      expect(row.anvisaCode).toBeNull();
      expect(row.anvisaSource).not.toBe('catalog_name');
    }
  });

  it('match por código exato continua gravando', async () => {
    mocks.resolveAnvisaByCodeAndName.mockResolvedValue(match('catalog_code_exact'));
    const { POST } = await import('@/app/api/products/sync-anvisa/route');
    const json = await (await POST(post('missing'))).json();

    expect(json.stats.updated).toBe(1);
    expect(mocks.upsertProductRegistry).toHaveBeenCalledWith(
      expect.objectContaining({ anvisaCode: '80123456789', anvisaSource: 'catalog_code_exact' }),
    );
  });
});
