import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '@/app/api/invoices/[id]/pdf/route';

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  getOrCreateSingleCompany: vi.fn(),
  invoiceFindFirst: vi.fn(),
  getOriginalIssuedPdf: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
  requireAuth: mocks.requireAuth,
  unauthorizedResponse: () => new Response('Não autorizado', { status: 401 }),
}));

vi.mock('@/lib/single-company', () => ({
  getOrCreateSingleCompany: mocks.getOrCreateSingleCompany,
}));

vi.mock('@/lib/original-issued-pdf', () => ({
  getOriginalIssuedPdf: mocks.getOriginalIssuedPdf,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    invoice: {
      findFirst: mocks.invoiceFindFirst,
    },
  },
}));

const SAMPLE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe35260112345678000199550010000123451001234567" versao="4.00">
      <ide>
        <natOp>Venda</natOp><serie>1</serie><nNF>12345</nNF>
        <dhEmi>2026-08-10T10:00:00-03:00</dhEmi>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Fornecedor de Entrada Ltda</xNome>
        <enderEmit><xLgr>Rua Teste</xLgr><nro>10</nro><xBairro>Centro</xBairro><xMun>SP</xMun><UF>SP</UF><CEP>01001000</CEP></enderEmit>
      </emit>
      <dest>
        <CNPJ>07832309000197</CNPJ>
        <xNome>Ql Med Materiais Hospitalares Ltda.</xNome>
      </dest>
      <det nItem="1">
        <prod><cProd>001</cProd><xProd>PRODUTO TESTE</xProd><NCM>90183999</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1</qCom><vUnCom>100</vUnCom><vProd>100</vProd></prod>
        <imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>100</vBC><pICMS>18</pICMS><vICMS>18</vICMS></ICMS00></ICMS></imposto>
      </det>
      <total><ICMSTot><vNF>100.00</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
  <protNFe><infProt><chNFe>35260112345678000199550010000123451001234567</chNFe></infProt></protNFe>
</nfeProc>`;

describe('GET /api/invoices/[id]/pdf — separação de leiaute entrada x saída', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue('user-1');
    mocks.getOrCreateSingleCompany.mockResolvedValue({ id: 'comp-1' });
    mocks.getOriginalIssuedPdf.mockResolvedValue(null);
  });

  it('renderiza nota de entrada (received) com o leiaute clássico de entrada sem logo QL MED', async () => {
    mocks.invoiceFindFirst.mockResolvedValue({
      id: 'inv-rec-1',
      companyId: 'comp-1',
      type: 'NFE',
      direction: 'received',
      number: '12345',
      series: '1',
      xmlContent: SAMPLE_XML,
      issueDate: new Date('2026-08-10'),
      totalValue: 100,
      company: { razaoSocial: 'QL MED', cnpj: '07832309000197' },
    });

    const req = new Request('http://localhost:3000/api/invoices/inv-rec-1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv-rec-1' }) });

    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('Fornecedor de Entrada Ltda');
    expect(html).toContain('RECEBEMOS DE Fornecedor de Entrada Ltda OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.');
    expect(html).toContain('QLMED - Sistema de Gest&atilde;o Fiscal');
    expect(html).not.toContain('emit-logo');
    expect(html).not.toContain('danfe-sheet');
    expect(html).not.toContain('entry-exit-spica');
  });

  it('renderiza nota emitida (issued) com o leiaute Spica e logo QL MED', async () => {
    mocks.invoiceFindFirst.mockResolvedValue({
      id: 'inv-iss-1',
      companyId: 'comp-1',
      type: 'NFE',
      direction: 'issued',
      number: '65254',
      series: '2',
      xmlContent: SAMPLE_XML.replaceAll('Fornecedor de Entrada Ltda', 'Ql Med Materiais Hospitalares Ltda.').replaceAll('12345678000199', '07832309000197'),
      issueDate: new Date('2026-09-08'),
      totalValue: 100,
      company: { razaoSocial: 'QL MED', cnpj: '07832309000197' },
    });

    const req = new Request('http://localhost:3000/api/invoices/inv-iss-1/pdf');
    const res = await GET(req, { params: Promise.resolve({ id: 'inv-iss-1' }) });

    expect(res.status).toBe(200);
    const html = await res.text();

    expect(html).toContain('emit-logo');
    expect(html).toContain('danfe-sheet');
    expect(html).toContain('entry-exit-spica');
    expect(html).toContain('canhoto-spacer');
    expect(html).toContain('QL MED MAT. HOSP. LTDA');
  });
});
