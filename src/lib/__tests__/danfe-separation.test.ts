import { describe, expect, it } from 'vitest';
import { extractDanfeData } from '@/lib/pdf/danfe-extract';
import { buildDanfeHtml, buildIssuedDanfeHtml, buildReceivedDanfeHtml } from '@/lib/pdf/danfe-generator';
import { parseXml } from '@/lib/pdf/pdf-utils';

const RECEIVED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe35260112345678000199550010000123451001234567" versao="4.00">
      <ide>
        <natOp>Venda de mercadoria</natOp><serie>1</serie><nNF>12345</nNF>
        <dhEmi>2026-08-10T10:00:00-03:00</dhEmi>
        <dhSaiEnt>2026-08-10T10:00:00-03:00</dhSaiEnt>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <xNome>Fornecedor Medico SA</xNome>
        <enderEmit>
          <xLgr>Av Paulista</xLgr><nro>1000</nro>
          <xBairro>Bela Vista</xBairro><xMun>Sao Paulo</xMun>
          <UF>SP</UF><CEP>01310100</CEP><fone>1130001111</fone>
        </enderEmit>
        <IE>111222333444</IE>
      </emit>
      <dest>
        <CNPJ>07832309000197</CNPJ>
        <xNome>Ql Med Materiais Hospitalares Ltda.</xNome>
        <enderDest>
          <xLgr>Rua Dr. Salomao Nahas</xLgr><nro>44</nro>
          <xBairro>Cachoeira II</xBairro><xMun>Campo Grande</xMun>
          <UF>MS</UF><CEP>79040044</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>MED-001</cProd>
          <xProd>CATETER BALAO CORONARIO</xProd>
          <NCM>90183999</NCM><CFOP>5102</CFOP><uCom>UN</uCom>
          <qCom>2.0000</qCom><vUnCom>500.0000</vUnCom><vProd>1000.00</vProd>
        </prod>
        <imposto>
          <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>18.00</pICMS><vICMS>180.00</vICMS></ICMS00></ICMS>
        </imposto>
      </det>
      <total><ICMSTot>
        <vBC>1000.00</vBC><vICMS>180.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST>
        <vProd>1000.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
        <vOutro>0.00</vOutro><vIPI>0.00</vIPI><vNF>1000.00</vNF>
      </ICMSTot></total>
      <transp><modFrete>0</modFrete></transp>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>35260112345678000199550010000123451001234567</chNFe>
      <dhRecbto>2026-08-10T10:01:00-03:00</dhRecbto>
      <nProt>135260000000001</nProt>
    </infProt>
  </protNFe>
</nfeProc>`;

const ISSUED_XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe50260907832309000197550020000652541658056263" versao="4.00">
      <ide>
        <natOp>Doacao</natOp><serie>2</serie><nNF>65254</nNF>
        <dhEmi>2026-09-08T19:12:43-04:00</dhEmi>
        <dhSaiEnt>2026-09-08T19:12:43-04:00</dhSaiEnt>
        <tpNF>1</tpNF>
      </ide>
      <emit>
        <CNPJ>07832309000197</CNPJ>
        <xNome>Ql Med Materiais Hospitalares Ltda.</xNome>
        <enderEmit>
          <xLgr>Rua Dr. Salomao Nahas</xLgr><nro>44</nro>
          <xBairro>Cachoeira II</xBairro><xMun>Campo Grande</xMun>
          <UF>MS</UF><CEP>79040044</CEP><fone>6733263520</fone>
        </enderEmit>
        <IE>283379189</IE>
      </emit>
      <dest>
        <CNPJ>19080416000195</CNPJ>
        <xNome>Procat Intervencoes Cardiovasculares</xNome>
        <enderDest>
          <xLgr>Rua Hilda Bergo Duarte</xLgr><nro>81</nro>
          <xBairro>Jardim Caramuru</xBairro><xMun>Dourados</xMun>
          <UF>MS</UF><CEP>79806020</CEP>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>TP00971</cProd>
          <xProd>TRANSDUTOR DE PRESSÃO</xProd>
          <NCM>90189010</NCM><CFOP>5910</CFOP><uCom>UN</uCom>
          <qCom>1.0000</qCom><vUnCom>120.00</vUnCom><vProd>120.00</vProd>
        </prod>
        <imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS></imposto>
      </det>
      <total><ICMSTot>
        <vBC>0.00</vBC><vICMS>0.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST>
        <vProd>120.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
        <vOutro>0.00</vOutro><vIPI>0.00</vIPI><vNF>120.00</vNF>
      </ICMSTot></total>
      <transp><modFrete>3</modFrete></transp>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>50260907832309000197550020000652541658056263</chNFe>
      <dhRecbto>2026-09-08T15:12:43-04:00</dhRecbto>
      <nProt>150260040806829</nProt>
    </infProt>
  </protNFe>
</nfeProc>`;

describe('Separação de geradores DANFE: entrada (received) vs saída (issued)', () => {
  it('gera DANFE de entrada no formato clássico sem logo QL MED e sem leiaute Spica', async () => {
    const data = extractDanfeData(await parseXml(RECEIVED_XML));
    const html = buildReceivedDanfeHtml(data);

    // Deve conter dados do fornecedor como texto simples
    expect(html).toContain('Fornecedor Medico SA');
    expect(html).toContain('12.345.678/0001-99');
    expect(html).toContain('Av Paulista');

    // NÃO pode conter o logo da QL MED
    expect(html).not.toContain('emit-logo');
    expect(html).not.toContain('<svg');

    // NÃO pode conter classes exclusivas do Spica de saída
    expect(html).not.toContain('danfe-sheet');
    expect(html).not.toContain('prods-filler');
    expect(html).not.toContain('entry-exit-spica');
    expect(html).not.toContain('canhoto-spacer');

    // Deve conter elementos do leiaute clássico de entrada
    expect(html).toContain('RECEBEMOS DE Fornecedor Medico SA OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.');
    expect(html).toContain('canhoto-line');
    expect(html).toContain('QLMED - Sistema de Gest&atilde;o Fiscal');
    expect(html).toContain('DATA E HORA DA IMPRESS&Atilde;O:');
    expect(html).toContain('background: #f5f5f5');
  });

  it('buildDanfeHtml roteia para buildReceivedDanfeHtml quando direction === "received"', async () => {
    const data = extractDanfeData(await parseXml(RECEIVED_XML));
    const htmlReceived = buildDanfeHtml(data, false, { direction: 'received' });
    const directReceived = buildReceivedDanfeHtml(data, false);

    // Ambos devem ser idênticos (exceto timestamp se coincidir no mesmo segundo)
    expect(htmlReceived).toContain('RECEBEMOS DE Fornecedor Medico SA OS PRODUTOS CONSTANTES NA NOTA FISCAL INDICADA AO LADO.');
    expect(htmlReceived).not.toContain('emit-logo');
    expect(htmlReceived).not.toContain('danfe-sheet');
    expect(htmlReceived).toBe(directReceived);
  });

  it('buildDanfeHtml usa leiaute Spica com logo ql_med para notas emitidas', async () => {
    const data = extractDanfeData(await parseXml(ISSUED_XML));
    const htmlIssued = buildDanfeHtml(data, false, { direction: 'issued' });
    const directIssued = buildIssuedDanfeHtml(data, false);

    // Deve conter o logo da QL MED e estrutura Spica
    expect(htmlIssued).toContain('emit-logo');
    expect(htmlIssued).toContain('danfe-sheet');
    expect(htmlIssued).toContain('prods-filler');
    expect(htmlIssued).toContain('entry-exit-spica');
    expect(htmlIssued).toContain('canhoto-line');
    expect(htmlIssued).toContain('QL MED MAT. HOSP. LTDA');
    expect(directIssued).toBe(htmlIssued);
  });
});
