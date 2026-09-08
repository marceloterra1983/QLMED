import { describe, expect, it } from 'vitest';
import { extractDanfeData } from '@/lib/pdf/danfe-extract';
import { buildDanfeHtml } from '@/lib/pdf/danfe-html';
import { splitProductsForPages } from '@/lib/pdf/danfe-paginate';
import { parseXml } from '@/lib/pdf/pdf-utils';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe50260907832309000197550020000652481004640325" versao="4.00">
      <ide>
        <natOp>Doacao</natOp><serie>2</serie><nNF>65248</nNF>
        <dhEmi>2026-09-08T14:42:02-04:00</dhEmi>
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
    </infNFe>
  </NFe>
</nfeProc>`;

describe('splitProductsForPages', () => {
  it('14 itens em 2 páginas: primeira menor ou igual, ordem e sem duplicata', () => {
    const items = Array.from({ length: 14 }, (_, i) => i + 1);
    const frozen = items.slice();
    const chunks = splitProductsForPages(items, 2);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBeLessThanOrEqual(chunks[1]!.length);
    expect(chunks.flat()).toEqual(frozen);
    expect(new Set(chunks.flat()).size).toBe(14);
    expect(items).toEqual(frozen);
  });

  it('lista vazia com 3 páginas devolve 3 arrays', () => {
    expect(splitProductsForPages([], 3)).toEqual([[], [], []]);
  });
});

describe('buildDanfeHtml FOLHA explícita', () => {
  it('default traz FOLHA: 1 de 1 literal, sem depender de counter', async () => {
    const data = extractDanfeData(await parseXml(XML));
    const html = buildDanfeHtml(data, false);
    expect(html).toContain('FOLHA: 1 de 1');
    expect(html).not.toMatch(/<span class="folha-counter"/);
    expect((html.match(/class="page"/g) || []).length).toBe(1);
  });

  it('pageCount 3 emite três folhas com FOLHA literal e dest só na primeira', async () => {
    const data = extractDanfeData(await parseXml(XML));
    const seed = data.products[0];
    if (!seed) throw new Error('fixture sem produto');
    data.products = Array.from({ length: 30 }, (_, i) => ({
      ...seed,
      cProd: String(i + 1).padStart(6, '0'),
    }));
    const html = buildDanfeHtml(data, false, { pageCount: 3 });
    expect(html).toContain('FOLHA: 1 de 3');
    expect(html).toContain('FOLHA: 2 de 3');
    expect(html).toContain('FOLHA: 3 de 3');
    expect((html.match(/class="page"/g) || []).length).toBe(3);
    expect((html.match(/DADOS ADICIONAIS/g) || []).length).toBeGreaterThanOrEqual(3);
    expect((html.match(/DESTINAT&Aacute;RIO\/REMETENTE/g) || []).length).toBe(1);
  });
});
