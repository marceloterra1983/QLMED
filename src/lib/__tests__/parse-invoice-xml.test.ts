import { describe, it, expect } from 'vitest';
import { parseInvoiceXml, extractPartyFiscalData } from '../parse-invoice-xml';

const SAMPLE_NFE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe35241012345678000199550010000012341123456789" versao="4.00">
      <ide>
        <nNF>1234</nNF>
        <serie>1</serie>
        <dhEmi>2024-10-15T10:30:00-03:00</dhEmi>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Empresa Emitente Ltda</xNome>
        <enderEmit>
          <UF>SP</UF>
        </enderEmit>
        <IE>123456789012</IE>
        <CRT>3</CRT>
      </emit>
      <dest>
        <CNPJ>98765432000188</CNPJ>
        <xNome>Empresa Destinataria SA</xNome>
        <enderDest>
          <UF>MG</UF>
        </enderDest>
        <IE>1234567890123</IE>
      </dest>
      <total>
        <ICMSTot>
          <vNF>1500.50</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
  <protNFe>
    <infProt>
      <chNFe>35241012345678000199550010000012341123456789</chNFe>
    </infProt>
  </protNFe>
</nfeProc>`;

const SAMPLE_CTE_XML = `<?xml version="1.0" encoding="UTF-8"?>
<cteProc xmlns="http://www.portalfiscal.inf.br/cte" versao="4.00">
  <CTe>
    <infCte Id="CTe35241098765432000188570010000005671987654321" versao="4.00">
      <ide>
        <nCT>567</nCT>
        <serie>1</serie>
        <dhEmi>2024-10-20T14:00:00-03:00</dhEmi>
        <toma3>
          <toma>3</toma>
        </toma3>
      </ide>
      <emit>
        <CNPJ>98765432000188</CNPJ>
        <xNome>Transportadora XYZ</xNome>
      </emit>
      <rem>
        <CNPJ>11111111000100</CNPJ>
        <xNome>Remetente Corp</xNome>
      </rem>
      <dest>
        <CNPJ>22222222000200</CNPJ>
        <xNome>Destinatario Corp</xNome>
      </dest>
      <vPrest>
        <vTPrest>350.00</vTPrest>
      </vPrest>
    </infCte>
  </CTe>
  <protCTe>
    <infProt>
      <chCTe>35241098765432000188570010000005671987654321</chCTe>
    </infProt>
  </protCTe>
</cteProc>`;

describe('parseInvoiceXml - NF-e', () => {
  it('parses a valid NF-e XML', async () => {
    const result = await parseInvoiceXml(SAMPLE_NFE_XML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('NFE');
    expect(result!.accessKey).toBe('35241012345678000199550010000012341123456789');
    expect(result!.number).toBe('1234');
    expect(result!.series).toBe('1');
    expect(result!.senderCnpj).toBe('12345678000199');
    expect(result!.senderName).toBe('Empresa Emitente Ltda');
    expect(result!.recipientCnpj).toBe('98765432000188');
    expect(result!.recipientName).toBe('Empresa Destinataria SA');
    expect(result!.totalValue).toBe(1500.50);
    expect(result!.issueDate).toBeInstanceOf(Date);
  });
});

describe('parseInvoiceXml - CT-e', () => {
  it('parses a valid CT-e XML', async () => {
    const result = await parseInvoiceXml(SAMPLE_CTE_XML);
    expect(result).not.toBeNull();
    expect(result!.type).toBe('CTE');
    expect(result!.accessKey).toBe('35241098765432000188570010000005671987654321');
    expect(result!.number).toBe('567');
    expect(result!.senderCnpj).toBe('98765432000188');
    expect(result!.senderName).toBe('Transportadora XYZ');
    // toma3 = 3 means dest is the tomador
    expect(result!.recipientCnpj).toBe('22222222000200');
    expect(result!.recipientName).toBe('Destinatario Corp');
    expect(result!.totalValue).toBe(350.00);
  });
});

describe('parseInvoiceXml - invalid input', () => {
  it('throws for non-XML content (xml2js parse error)', async () => {
    await expect(parseInvoiceXml('not xml at all')).rejects.toThrow();
  });

  it('returns null for unrecognized XML structure', async () => {
    const result = await parseInvoiceXml('<root><data>123</data></root>');
    expect(result).toBeNull();
  });
});

describe('extractPartyFiscalData', () => {
  it('extracts emitter fiscal data from NF-e XML', async () => {
    const data = await extractPartyFiscalData(SAMPLE_NFE_XML, 'emit');
    expect(data).not.toBeNull();
    expect(data!.cnpj).toBe('12345678000199');
    expect(data!.ie).toBe('123456789012');
    expect(data!.crt).toBe('3');
    expect(data!.uf).toBe('SP');
  });

  it('extracts recipient fiscal data from NF-e XML', async () => {
    const data = await extractPartyFiscalData(SAMPLE_NFE_XML, 'dest');
    expect(data).not.toBeNull();
    expect(data!.cnpj).toBe('98765432000188');
    expect(data!.ie).toBe('1234567890123');
    expect(data!.uf).toBe('MG');
  });

  it('returns null for invalid XML', async () => {
    const data = await extractPartyFiscalData('not xml', 'emit');
    expect(data).toBeNull();
  });
});

describe('NFS-e accessKey fallback', () => {
  const buildNfseXml = (emitCnpj: string, nNFSe: string) => `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe nNFSe="${nNFSe}">
    <DPS>
      <infDPS Id="">
        <prest><CNPJ>${emitCnpj}</CNPJ><xNome>Prestador</xNome></prest>
        <toma><CNPJ>11111111000100</CNPJ><xNome>Tomador</xNome></toma>
        <valores><vServPrest><vServ>100</vServ></vServPrest></valores>
      </infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;

  it('synthesizes distinct accessKeys for different emitters sharing the same nNFSe', async () => {
    const a = await parseInvoiceXml(buildNfseXml('11111111000199', '42'));
    const b = await parseInvoiceXml(buildNfseXml('22222222000199', '42'));
    expect(a?.accessKey).toBeTruthy();
    expect(b?.accessKey).toBeTruthy();
    expect(a!.accessKey).not.toBe(b!.accessKey);
    expect(a!.accessKey).toContain('11111111000199');
    expect(a!.accessKey).toContain('42');
  });

  it('returns null when both Id and document number are absent', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<NFSe xmlns="http://www.sped.fazenda.gov.br/nfse">
  <infNFSe>
    <DPS>
      <infDPS><prest><CNPJ>99999999000199</CNPJ></prest></infDPS>
    </DPS>
  </infNFSe>
</NFSe>`;
    const result = await parseInvoiceXml(xml);
    expect(result).toBeNull();
  });
});
