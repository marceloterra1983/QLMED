import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * AUTH-001 / AUTH-002 / AUTH-004. Três caminhos decidiam sem `companyId`:
 * o export de XML varria todas as notas do banco, a validação ANVISA lia e
 * REESCREVIA o product_registry de qualquer empresa, e o importador de XML
 * local caía na empresa mais antiga quando o CNPJ canónico não existia.
 *
 * Estes testes olham para o `where` que chega ao Prisma, não para o texto do
 * ficheiro: um `companyId` importado e não usado continuaria a falhar aqui.
 */

const mocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  invoiceCount: vi.fn(),
  invoiceFindMany: vi.fn(),
  registryFindFirst: vi.fn(),
  registryFindMany: vi.fn(),
  registryUpdate: vi.fn(),
  companyFindUnique: vi.fn(),
  companyFindFirst: vi.fn(),
  fetchAnvisaData: vi.fn(),
  saveXmlToFile: vi.fn(),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: mocks.requireEditor,
    requireAuth: mocks.requireAuth,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
  getSingleCompany: vi.fn(),
}));
vi.mock('@/lib/anvisa-api', () => ({ fetchAnvisaData: mocks.fetchAnvisaData }));
vi.mock('@/lib/xml-file-store', () => ({ saveXmlToFile: mocks.saveXmlToFile }));
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));
vi.mock('@/lib/prisma', () => {
  const mockPrisma = {
    invoice: { count: mocks.invoiceCount, findMany: mocks.invoiceFindMany },
    productRegistry: {
      findFirst: mocks.registryFindFirst,
      findMany: mocks.registryFindMany,
      update: mocks.registryUpdate,
    },
    company: { findUnique: mocks.companyFindUnique, findFirst: mocks.companyFindFirst },
  };
  return { default: mockPrisma, prisma: mockPrisma };
});

const COMPANY = { id: 'company-1', cnpj: '07832309000197' };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrCreateSingleCompany.mockResolvedValue(COMPANY);
  mocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
  mocks.requireAuth.mockResolvedValue('user-1');
});

describe('AUTH-001 — export de XML filtra por empresa', () => {
  it('conta e pagina apenas as notas da empresa do chamador', async () => {
    mocks.invoiceCount.mockResolvedValue(1);
    mocks.invoiceFindMany.mockResolvedValueOnce([
      {
        id: 'inv-1',
        accessKey: '3'.repeat(44),
        type: 'NFE',
        issueDate: new Date('2026-01-02'),
        xmlContent: '<nfeProc/>',
      },
    ]);
    mocks.invoiceFindMany.mockResolvedValue([]);
    mocks.saveXmlToFile.mockResolvedValue(true);

    const { POST } = await import('@/app/api/invoices/export-xml/route');
    const res = await POST(
      new Request('http://localhost/api/invoices/export-xml', {
        method: 'POST',
        body: JSON.stringify({ years: 1 }),
        headers: { 'content-type': 'application/json' },
      }) as never,
    );
    // Drena o stream para que o findMany paginado corra de facto.
    await res.text();

    expect(mocks.invoiceCount).toHaveBeenCalledTimes(1);
    const countWhere = mocks.invoiceCount.mock.calls[0][0].where;
    expect(countWhere.companyId).toBe(COMPANY.id);

    expect(mocks.invoiceFindMany).toHaveBeenCalled();
    for (const call of mocks.invoiceFindMany.mock.calls) {
      expect(call[0].where.companyId).toBe(COMPANY.id);
    }
  });
});

describe('AUTH-002 — validação ANVISA filtra por empresa', () => {
  it('lê o cache só dentro da empresa do chamador', async () => {
    mocks.registryFindFirst.mockResolvedValue({
      anvisaMatchedProductName: 'Produto',
      anvisaHolder: 'Titular',
      anvisaStatus: 'Válido',
      anvisaExpiration: null,
      anvisaRiskClass: null,
      anvisaProcess: null,
      anvisaSyncedAt: new Date(),
    });

    const { GET } = await import('@/app/api/anvisa/validate/route');
    const res = await GET(
      new NextRequest('http://localhost/api/anvisa/validate?code=12345678901'),
    );
    expect(res.status).toBe(200);

    expect(mocks.registryFindFirst).toHaveBeenCalledTimes(1);
    expect(mocks.registryFindFirst.mock.calls[0][0].where.companyId).toBe(COMPANY.id);
  });

  it('só reescreve linhas da empresa do chamador ao sincronizar', async () => {
    mocks.registryFindFirst.mockResolvedValue(null);
    mocks.fetchAnvisaData.mockResolvedValue({
      nomeProduto: 'Produto',
      nomeEmpresa: 'Titular',
      situacaoRegistro: 'Válido',
      vencimentoRegistro: null,
      classeRisco: null,
      processoRegistro: null,
    });
    mocks.registryFindMany.mockResolvedValue([]);

    const { GET } = await import('@/app/api/anvisa/validate/route');
    await GET(new NextRequest('http://localhost/api/anvisa/validate?code=12345678901'));

    expect(mocks.registryFindMany).toHaveBeenCalledTimes(1);
    expect(mocks.registryFindMany.mock.calls[0][0].where.companyId).toBe(COMPANY.id);
  });
});

/**
 * AUTH-007, segunda metade. O portão estático (api-route-guards.test.ts) prova
 * que cada handler CITA uma guarda; estes negativos provam que a guarda
 * realmente decide o código de resposta nas rotas P0.
 */
describe('AUTH-007 — negativos HTTP reais nas rotas P0', () => {
  it('export-xml devolve 401 sem sessão e 403 sem papel', async () => {
    const { POST } = await import('@/app/api/invoices/export-xml/route');
    const request = () =>
      new Request('http://localhost/api/invoices/export-xml', {
        method: 'POST',
        body: JSON.stringify({ years: 1 }),
        headers: { 'content-type': 'application/json' },
      }) as never;

    mocks.requireEditor.mockRejectedValueOnce(new Error('NOT_AUTHENTICATED'));
    expect((await POST(request())).status).toBe(401);

    mocks.requireEditor.mockRejectedValueOnce(new Error('FORBIDDEN'));
    expect((await POST(request())).status).toBe(403);

    // E não chegou a tocar no banco em nenhum dos dois casos.
    expect(mocks.invoiceCount).not.toHaveBeenCalled();
    expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
  });

  it('invoices/[id] devolve 401 sem sessão e não consulta o banco', async () => {
    const { GET } = await import('@/app/api/invoices/[id]/route');
    mocks.requireAuth.mockRejectedValueOnce(new Error('NOT_AUTHENTICATED'));

    const res = await GET(new Request('http://localhost/api/invoices/inv-1') as never, {
      params: Promise.resolve({ id: 'inv-1' }),
    });

    expect(res.status).toBe(401);
    expect(mocks.getOrCreateSingleCompany).not.toHaveBeenCalled();
  });
});

describe('AUTH-004 — importador de XML não cai numa empresa qualquer', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('devolve a empresa quando o CNPJ canónico existe', async () => {
    mocks.companyFindUnique.mockResolvedValue(COMPANY);
    const { getTargetCompany } = await import('@/lib/local-xml-sync/file-import');
    await expect(getTargetCompany()).resolves.toEqual(COMPANY);
  });

  it('pausa em vez de escolher a primeira empresa do banco', async () => {
    mocks.companyFindUnique.mockResolvedValue(null);
    mocks.companyFindFirst.mockResolvedValue({ id: 'outra-empresa', cnpj: '99999999000199' });

    const { getTargetCompany } = await import('@/lib/local-xml-sync/file-import');
    await expect(getTargetCompany()).resolves.toBeNull();
    expect(mocks.companyFindFirst).not.toHaveBeenCalled();
  });
});
