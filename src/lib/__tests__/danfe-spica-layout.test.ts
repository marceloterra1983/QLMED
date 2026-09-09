import { describe, expect, it } from 'vitest';
import { extractDanfeData } from '@/lib/pdf/danfe-extract';
import { buildDanfeHtml } from '@/lib/pdf/danfe-html';
import { fmtDateIso, fmtTimeIso } from '@/lib/pdf/pdf-utils';
import { parseXml } from '@/lib/pdf/pdf-utils';

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc versao="4.00">
  <NFe>
    <infNFe Id="NFe50260907832309000197550020000652481004640325" versao="4.00">
      <ide>
        <natOp>Doacao</natOp><serie>2</serie><nNF>65248</nNF>
        <dhEmi>2026-09-08T14:41:02-04:00</dhEmi>
        <dhSaiEnt>2026-09-08T14:42:02-04:00</dhSaiEnt>
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
          <UF>MS</UF><CEP>79806020</CEP><fone>6730323632</fone>
        </enderDest>
      </dest>
      <det nItem="1">
        <prod>
          <cProd>002626</cProd>
          <xProd>TP00971 - TRANSDUTOR DE PRESSAO C/ TORNEIRA VALVULADA</xProd>
          <NCM>90183999</NCM><CFOP>5910</CFOP><uCom>UN</uCom>
          <qCom>4.0000</qCom><vUnCom>120.0000</vUnCom><vProd>480.00</vProd>
        </prod>
        <imposto>
          <ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS>
          <vTotTrib>0.00</vTotTrib>
        </imposto>
        <infAdProd>(Lote 26C52)        (RVS 10216839008)    (CNPJ. Fab. 68867522000129)</infAdProd>
      </det>
      <total><ICMSTot>
        <vBC>0.00</vBC><vICMS>0.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST>
        <vProd>480.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc>
        <vOutro>0.00</vOutro><vIPI>0.00</vIPI><vNF>480.00</vNF>
      </ICMSTot></total>
      <transp>
        <modFrete>0</modFrete>
        <transporta>
          <CNPJ>07832309000197</CNPJ><xNome>TRANSPORTE PROPRIO</xNome>
          <IE>283379189</IE><xEnder>R. Salomao Nahas,44</xEnder>
          <xMun>Campo Grande</xMun><UF>MS</UF>
        </transporta>
        <vol><qVol>1</qVol><esp>Material Medico</esp></vol>
      </transp>
      <infAdic><infCpl>(Ped. Vda. 0000047442)</infCpl></infAdic>
    </infNFe>
  </NFe>
  <protNFe versao="4.00">
    <infProt>
      <chNFe>50260907832309000197550020000652481004640325</chNFe>
      <dhRecbto>2026-09-08T14:41:03-04:00</dhRecbto>
      <nProt>150260040795876</nProt>
    </infProt>
  </protNFe>
</nfeProc>`;

describe('DANFE leiaute SPICA 65248', () => {
  it('lê o relógio do ISO sem converter fuso', () => {
    expect(fmtDateIso('2026-09-08T14:42:02-04:00')).toBe('08/09/2026');
    expect(fmtTimeIso('2026-09-08T14:42:02-04:00')).toBe('14:42:02');
  });

  it('extrai DNA e monta HTML âncora do gabarito', async () => {
    const parsed = await parseXml(XML);
    const data = extractDanfeData(parsed);
    expect(data.chNFe).toBe('50260907832309000197550020000652481004640325');
    expect(data.nProt).toBe('150260040795876');
    expect(data.products[0]?.origCST).toBe('040');
    expect(data.products[0]?.cProd).toBe('002626');
    expect(data.transpNome).toBe('TRANSPORTE PROPRIO');

    const html = buildDanfeHtml(data, false);
    expect(html).toContain('PRODUTOS/SERVI');
    expect(html).toContain('INDICADA ABAIXO');
    expect(html).toContain('VALOR DA NOTA');
    expect(html).toContain('FOLHA: 1 de 1');
    expect(html).toContain('danfe-sheet');
    expect(html).toContain('DADOS ADICIONAIS');
    expect(html).toContain('QL MED MAT. HOSP. LTDA');
    expect(html).toContain('Ql Med Materiais Hospitalares Ltda.');
    expect(html).toContain('5026 0907 8323 0900 0197 5500 2000 0652 4810 0464 0325');
    expect(html).toContain('150260040795876 - 2026-09-08T14:41:03-04:00');
    expect(html).toContain('08/09/2026');
    expect(html).toContain('14:42:02');
    expect(html).toContain('FATURA/DUPLICATA');
    expect(html).toContain('V.AP.TRB.');
    expect(html).toContain('VAL. APROX. TRIB.');
    expect(html).toContain('TRANSPORTE PROPRIO');
    expect(html).toContain('0 - Rem.');
    expect(html).toContain('4,0000');
    expect(html).toContain('120,0000');
    expect(html).toContain('480,00');
    expect(html).toContain('(Lote 26C52)');
    expect(html).toContain('(Ped. Vda. 0000047442)');
    expect(html).toContain('class="barcode"');
    expect(html).not.toContain('data:');
    expect(html).not.toContain('QLMED - Sistema');
    expect(html).not.toContain('S&Eacute;RIE: 002');

    // Fidelidade do canhoto e cabeçalho Spica 65248
    expect(html).toContain('canhoto-line');
    expect(html).toContain('entry-exit-spica');
    expect(html).toContain('width:41.2%');
    expect(html).toContain('width:15.8%');
    expect(html).toContain('width:43.0%');
    expect(html).toContain('emit-logo-wrap');
    expect(html).toContain('emit-line');
    expect(html).toContain('R. Dr. Salomão Nahas, Nº 44');
    expect(html).toContain('Bairro: Cachoeira II');
    expect(html).toContain('Campo Grande - MS');
    expect(html).toContain('CEP: 79040-044');
    expect(html).toContain('FONE: (67) 3326-3520');
    expect(html).not.toContain('sr-only');
    expect(html).toContain('prods-filler');
  });

  it('renderiza NF 65254 com fidelidade ao modelo Spica 65248', async () => {
    const xml65254 = `<?xml version="1.0" encoding="UTF-8"?><nfeProc versao="4.00"><NFe><infNFe Id="NFe50260907832309000197550020000652541658056263" versao="4.00"><ide><natOp>Doacao</natOp><serie>2</serie><nNF>65254</nNF><dhEmi>2026-09-08T19:12:43-04:00</dhEmi><dhSaiEnt>2026-09-08T19:12:43-04:00</dhSaiEnt><tpNF>1</tpNF></ide><emit><CNPJ>07832309000197</CNPJ><xNome>Ql Med Materiais Hospitalares Ltda.</xNome><enderEmit><xLgr>Rua Dr. Salomao Nahas</xLgr><nro>44</nro><xBairro>Cachoeira II</xBairro><xMun>Campo Grande</xMun><UF>MS</UF><CEP>79040044</CEP><fone>6733263520</fone></enderEmit><IE>283379189</IE></emit><dest><CNPJ>19080416000195</CNPJ><xNome>Procat Intervencoes Cardiovasculares</xNome><enderDest><xLgr>Rua Hilda Bergo Duarte</xLgr><nro>81</nro><xBairro>Jardim Caramuru</xBairro><xMun>Dourados</xMun><UF>MS</UF><CEP>79806020</CEP></enderDest></dest><det nItem="1"><prod><cProd>TP00971</cProd><xProd>TRANSDUTOR DE PRESSÃO C/ TORNEIRA VALVULADA</xProd><NCM>90189010</NCM><CFOP>5910</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>120.00</vUnCom><vProd>120.00</vProd></prod><imposto><ICMS><ICMS40><orig>0</orig><CST>40</CST></ICMS40></ICMS></imposto><infAdProd>(Lote 18H03)        (RVS 10216839008)</infAdProd></det><total><ICMSTot><vBC>0.00</vBC><vICMS>0.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>120.00</vProd><vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vOutro>0.00</vOutro><vIPI>0.00</vIPI><vNF>120.00</vNF></ICMSTot></total><transp><modFrete>3</modFrete><transporta><CNPJ>07832309000197</CNPJ><xNome>TRANSPORTE PROPRIO</xNome><IE>283379189</IE><xEnder>Rua Dr. Salomao Nahas,44</xEnder><xMun>Campo Grande</xMun><UF>MS</UF></transporta><vol><qVol>1</qVol><esp>Material Medico</esp></vol></transp><infAdic><infAdFisco>Procedimento autorizado pelo Ajuste SINIEF 02/24</infAdFisco><infCpl>Isento ICMS Conv.1/99 Prorrog.ate 31/12/2026 pelo Conv 78/2025 de 08 de julho de 2025</infCpl></infAdic></infNFe></NFe><protNFe versao="4.00"><infProt><chNFe>50260907832309000197550020000652541658056263</chNFe><dhRecbto>2026-09-08T15:12:43-04:00</dhRecbto><nProt>150260040806829</nProt></infProt></protNFe></nfeProc>`;
    const data = extractDanfeData(await parseXml(xml65254));
    const html = buildDanfeHtml(data, false);
    expect(html).toContain('000.065.254');
    expect(html).toContain('TP00971');
    expect(html).toContain('120,00');
    expect(html).toContain('emit-logo');
    expect(html).toContain('Isento ICMS Conv.1/99');
    expect(html).toContain('Procedimento autorizado pelo Ajuste SINIEF 02/24');
    expect(html).not.toContain('data:');
  });
});
