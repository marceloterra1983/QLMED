import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  registryFindMany: vi.fn(),
  registryUpdate: vi.fn(),
  invoiceFindMany: vi.fn(),
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
vi.mock('@/lib/prisma', () => ({
  default: {
    productRegistry: { findMany: mocks.registryFindMany, update: mocks.registryUpdate },
    invoice: { findMany: mocks.invoiceFindMany },
  },
}));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

function row(id: string, code: string, description: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    productKey: `key-${id}`,
    code,
    description,
    ncm: '90183119',
    unit: 'UN',
    ean: null,
    anvisaCode: null,
    anvisaSource: null,
    productType: null,
    productSubtype: null,
    anvisaHolder: null,
    anvisaManufacturer: null,
    ...extra,
  };
}

describe('POST /api/products/auto-classify — nunca herda registro ANVISA', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1' });
    mocks.registryUpdate.mockResolvedValue({});
    // Mesmo fornecedor para os três: cobre as estratégias 2, 2b e 5.
    const xml = '<cProd>SER1001</cProd><cProd>SER1002</cProd><cProd>SER1003</cProd>';
    mocks.invoiceFindMany.mockResolvedValue([
      { senderCnpj: '11111111000191', senderName: 'Fornecedor', xmlContent: xml },
    ]);
    mocks.registryFindMany.mockResolvedValue([
      row('a', 'SER1001', 'Seringa descartavel luer lock 10ml', {
        anvisaCode: '80123456789',
        anvisaSource: 'manual',
        productType: 'Materiais Hospitalares',
        productSubtype: 'Material de Punção e Infusão',
      }),
      // Descrição idêntica e código vizinho: antes herdava o registro de "a".
      row('b', 'SER1002', 'Seringa descartavel luer lock 10ml'),
      row('c', 'SER1003', 'Seringa descartavel luer lock 20ml'),
    ]);
  });

  it('tipo/subtipo continuam sendo inferidos, anvisaCode não é gravado', async () => {
    const { POST } = await import('@/app/api/products/auto-classify/route');
    const res = await POST(
      new Request('http://localhost/api/products/auto-classify', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false }),
        headers: { 'content-type': 'application/json' },
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.registryUpdate).toHaveBeenCalled();
    for (const [args] of mocks.registryUpdate.mock.calls) {
      expect(args.data).not.toHaveProperty('anvisaCode');
      expect(args.data).not.toHaveProperty('anvisaSource');
    }
    expect(mocks.registryUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'b' },
        data: expect.objectContaining({ productType: 'Materiais Hospitalares' }),
      }),
    );
    for (const p of json.preview) expect(p.fields).not.toHaveProperty('anvisa_code');
  });
});
