import { describe, expect, it } from 'vitest';
import { extractDanfeData } from '@/lib/pdf/danfe-extract';
import { buildDanfeHtml } from '@/lib/pdf/danfe-html';
import { parseXml } from '@/lib/pdf/pdf-utils';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe50260907832309000197550020000652101004640325" versao="4.00">
      <ide>
        <natOp>Doacao</natOp><serie>2</serie><nNF>65210</nNF>
        <dhEmi>2026-09-08T14:41:02-04:00</dhEmi>
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
          <cProd>002626</cProd>
          <xProd>TP00971 - TRANSDUTOR</xProd>
          <NCM>90183999</NCM><CFOP>5910</CFOP><uCom>UN</uCom>
          <qCom>1.0000</qCom><vUnCom>10.0000</vUnCom><vProd>10.00</vProd>
        </prod>
        <imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS></imposto>
      </det>
      <total><ICMSTot>
        <vBC>0.00</vBC><vICMS>0.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST>
        <vProd>10.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
        <vOutro>0.00</vOutro><vIPI>0.00</vIPI><vNF>10.00</vNF>
      </ICMSTot></total>
      <infAdic><infCpl>(Ped. Vda. 0000047442)</infCpl></infAdic>
    </infNFe>
  </NFe>
</nfeProc>`;

describe('DANFE multipage sheet', () => {
  it('marca FOLHA com data-total informado', async () => {
    const data = extractDanfeData(await parseXml(XML));
    const html = buildDanfeHtml(data, false, { totalPages: 2 });
    expect(html).toContain('data-total="2"');
    expect(html).toContain('FOLHA:');
    expect(html).toContain('folha-counter');
  });

  it('tem um thead (canhoto+header) e um tfoot (dados adicionais)', async () => {
    const data = extractDanfeData(await parseXml(XML));
    const html = buildDanfeHtml(data, false, { totalPages: 2 });
    expect(html.match(/<thead>/g)?.length).toBeGreaterThanOrEqual(1);
    expect(html).toMatch(/<thead>\s*<tr><td class="sheet-cell">[\s\S]*RECEBEMOS DE/);
    expect(html).toMatch(/<thead>\s*<tr><td class="sheet-cell">[\s\S]*class="emit-block"/);
    expect(html.match(/<tfoot>/g)?.length).toBe(1);
    expect(html).toMatch(/<tfoot>[\s\S]*DADOS ADICIONAIS/);
  });

  it('mantém thead e tfoot com muitas linhas de produto', async () => {
    const data = extractDanfeData(await parseXml(XML));
    const seed = data.products[0];
    if (!seed) throw new Error('fixture sem produto');
    data.products = Array.from({ length: 20 }, (_, i) => ({
      ...seed,
      cProd: String(i + 1).padStart(6, '0'),
    }));
    const html = buildDanfeHtml(data, false, { totalPages: 2 });
    expect(html).toContain('RECEBEMOS DE');
    expect(html).toContain('Ql Med Materiais Hospitalares Ltda.');
    expect(html).toContain('DADOS ADICIONAIS');
    expect(html).toMatch(/<thead>\s*<tr><td class="sheet-cell">/);
    expect(html).toMatch(/<tfoot>[\s\S]*DADOS ADICIONAIS/);
    expect(html).toContain('000020');
  });
});
