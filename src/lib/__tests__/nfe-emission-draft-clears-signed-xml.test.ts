import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireEditor: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  emissionFindFirst: vi.fn(),
  emissionUpdate: vi.fn(),
  invoiceFindMany: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  requireEditor: mocks.requireEditor,
  unauthorizedResponse: () => new Response(null, { status: 401 }),
  forbiddenResponse: () => new Response(null, { status: 403 }),
}));
vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));
vi.mock('@/lib/prisma', () => ({
  default: {
    invoiceEmission: { findFirst: mocks.emissionFindFirst, update: mocks.emissionUpdate },
    invoice: { findMany: mocks.invoiceFindMany },
  },
}));

import { GET, PATCH } from '@/app/api/nfe-emissions/[id]/route';

const DEST_CNPJ = '11222333000181';
const SIGNED = '<NFe><Signature>ASSINATURA-ANTERIOR</Signature></NFe>';

const payload = {
  series: '2',
  natureza: 'Venda',
  cfop: '5102',
  destCnpj: DEST_CNPJ,
  destName: 'CLIENTE TESTE',
  indFinal: '0',
  indPres: '9',
  items: [
    {
      productId: 'prod-1',
      cProd: 'P1',
      xProd: 'Produto',
      ncm: '90211010',
      cfop: '5102',
      uCom: 'UN',
      qCom: '1',
      vUnCom: '10.00',
    },
  ],
};

function params() {
  return { params: Promise.resolve({ id: 'em-1' }) };
}

describe('PATCH /api/nfe-emissions/[id] — FISCAL-011', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.requireEditor.mockResolvedValue({ userId: 'user-1' });
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'company-1', cnpj: '99888777000166' });
    mocks.emissionFindFirst.mockResolvedValue({
      id: 'em-1',
      companyId: 'company-1',
      status: 'rejected',
      destName: 'CLIENTE TESTE',
      signedXml: SIGNED,
      protocolXml: '<protNFe/>',
    });
    mocks.invoiceFindMany.mockResolvedValue([{ recipientCnpj: DEST_CNPJ }]);
    mocks.emissionUpdate.mockResolvedValue({
      id: 'em-1',
      status: 'draft',
      signedXml: null,
      protocolXml: null,
    });
  });

  it('apaga o signedXml e o protocolXml ao voltar para draft', async () => {
    const request = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const response = await PATCH(request, params());

    expect(response.status).toBe(200);
    expect(mocks.emissionUpdate).toHaveBeenCalledTimes(1);
    const { data } = mocks.emissionUpdate.mock.calls[0][0];
    expect(data.status).toBe('draft');
    expect(data.signedXml).toBeNull();
    expect(data.protocolXml).toBeNull();
    // Coerência: o número e a chave da tentativa anterior já eram zerados.
    expect(data.number).toBeNull();
    expect(data.accessKey).toBeNull();
  });

  it('a resposta não devolve signedXml nem protocolXml', async () => {
    mocks.emissionUpdate.mockResolvedValue({
      id: 'em-1',
      status: 'draft',
      signedXml: SIGNED,
      protocolXml: '<protNFe/>',
    });
    const request = new Request('http://localhost', {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });

    const response = await PATCH(request, params());
    const body = await response.json();

    expect(Object.keys(body.emission)).not.toContain('signedXml');
    expect(Object.keys(body.emission)).not.toContain('protocolXml');
    expect(JSON.stringify(body)).not.toContain('ASSINATURA-ANTERIOR');
  });

  it('o GET também não devolve signedXml', async () => {
    mocks.emissionFindFirst.mockResolvedValue({
      id: 'em-1',
      companyId: 'company-1',
      status: 'authorized',
      signedXml: SIGNED,
      protocolXml: '<protNFe/>',
    });

    const response = await GET(new Request('http://localhost'), params());
    const body = await response.json();

    expect(Object.keys(body.emission)).not.toContain('signedXml');
    expect(JSON.stringify(body)).not.toContain('ASSINATURA-ANTERIOR');
  });
});
