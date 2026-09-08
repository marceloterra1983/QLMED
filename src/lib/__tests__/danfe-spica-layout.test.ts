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
  });
});
