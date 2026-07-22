import { describe, it, expect } from 'vitest';
import {
  extractTaxTotals,
  extractItemTaxes,
  extractEmitterLocation,
  extractAllTaxData,
} from '../parse-invoice-tax';

// ── Fixture A: Regime Normal, 1 item, ICMS00, PIS/COFINS/IPI tributados ──
const NFE_NORMAL = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe1" versao="4.00">
      <emit>
        <CNPJ>12345678000199</CNPJ>
        <enderEmit><xMun>Campo Grande</xMun><UF>MS</UF></enderEmit>
        <CRT>3</CRT>
      </emit>
      <det nItem="1">
        <prod>
          <cProd>P001</cProd><xProd>Produto A</xProd><NCM>30049099</NCM>
          <CFOP>5102</CFOP><CEST>1300100</CEST>
          <qCom>2.0000</qCom><vUnCom>50.00</vUnCom><vProd>100.00</vProd><vDesc>5.00</vDesc>
        </prod>
        <imposto>
          <ICMS><ICMS00>
            <orig>0</orig><CST>00</CST><vBC>95.00</vBC><pICMS>17.00</pICMS><vICMS>16.15</vICMS>
          </ICMS00></ICMS>
          <IPI><IPITrib><CST>50</CST><vBC>95.00</vBC><pIPI>5.00</pIPI><vIPI>4.75</vIPI></IPITrib></IPI>
          <PIS><PISAliq><CST>01</CST><vBC>95.00</vBC><pPIS>1.65</pPIS><vPIS>1.57</vPIS></PISAliq></PIS>
          <COFINS><COFINSAliq><CST>01</CST><vBC>95.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>7.22</vCOFINS></COFINSAliq></COFINS>
        </imposto>
      </det>
      <total>
        <ICMSTot>
          <vProd>100.00</vProd><vBC>95.00</vBC><vICMS>16.15</vICMS>
          <vBCST>0.00</vBCST><vST>0.00</vST>
          <vPIS>1.57</vPIS><vCOFINS>7.22</vCOFINS><vIPI>4.75</vIPI>
          <vFrete>10.00</vFrete><vSeg>0.00</vSeg><vDesc>5.00</vDesc><vOutro>0.00</vOutro>
          <vTotTrib>29.69</vTotTrib><vFCP>0.00</vFCP><vNF>109.75</vNF>
        </ICMSTot>
      </total>
    </infNFe>
  </NFe>
</nfeProc>`;

// ── Fixture B: Simples Nacional (CSOSN via ICMSSN102), 2 itens (array), PIS/COFINS NT ──
const NFE_SIMPLES = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe2" versao="4.00">
      <emit><enderEmit><xMun>Dourados</xMun><UF>MS</UF></enderEmit><CRT>1</CRT></emit>
      <det nItem="1">
        <prod><cProd>S1</cProd><xProd>Item Simples 1</xProd><NCM>21069090</NCM><CFOP>5405</CFOP>
          <qCom>1.0000</qCom><vUnCom>200.00</vUnCom><vProd>200.00</vProd></prod>
        <imposto>
          <ICMS><ICMSSN102><orig>0</orig><CSOSN>102</CSOSN></ICMSSN102></ICMS>
          <PIS><PISNT><CST>07</CST></PISNT></PIS>
          <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
        </imposto>
      </det>
      <det nItem="2">
        <prod><cProd>S2</cProd><xProd>Item Simples 2</xProd><NCM>33049910</NCM><CFOP>5405</CFOP>
          <qCom>3.0000</qCom><vUnCom>10,50</vUnCom><vProd>31,50</vProd></prod>
        <imposto>
          <ICMS><ICMSSN101><orig>0</orig><CSOSN>101</CSOSN><pCredSN>2.50</pCredSN><vCredICMSSN>0.79</vCredICMSSN></ICMSSN101></ICMS>
          <PIS><PISNT><CST>07</CST></PISNT></PIS>
          <COFINS><COFINSNT><CST>07</CST></COFINSNT></COFINS>
        </imposto>
      </det>
      <total><ICMSTot><vProd>231.50</vProd><vNF>231.50</vNF></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;

// ── Fixture C: ICMS60 (ST retido), FCP via ICMSUFDest, det único (não-array) ──
const NFE_ST_FCP = `<?xml version="1.0" encoding="UTF-8"?>
<NFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <infNFe Id="NFe3" versao="4.00">
    <emit><enderEmit><xMun>Sao Paulo</xMun><UF>SP</UF></enderEmit></emit>
    <det nItem="1">
      <prod><cProd>ST1</cProd><xProd>Produto ST</xProd><NCM>22021000</NCM><CFOP>5405</CFOP>
        <qCom>10.0000</qCom><vUnCom>5.00</vUnCom><vProd>50.00</vProd></prod>
      <imposto>
        <ICMS><ICMS60>
          <orig>0</orig><CST>60</CST><vBCST>60.00</vBCST><vICMSST>10.20</vICMSST><vFCP>1.20</vFCP>
        </ICMS60></ICMS>
        <ICMSUFDest><vFCPUFDest>2.50</vFCPUFDest></ICMSUFDest>
        <PIS><PISOutr><CST>99</CST><vBC>50.00</vBC><pPIS>1.65</pPIS><vPIS>0.83</vPIS></PISOutr></PIS>
        <COFINS><COFINSOutr><CST>99</CST><vBC>50.00</vBC><pCOFINS>7.60</pCOFINS><vCOFINS>3.80</vCOFINS></COFINSOutr></COFINS>
      </imposto>
    </det>
    <total><ICMSTot><vProd>50.00</vProd><vBCST>60.00</vBCST><vST>10.20</vST><vFCPUFDest>2.50</vFCPUFDest><vNF>50.00</vNF></ICMSTot></total>
  </infNFe>
</NFe>`;

describe('extractTaxTotals', () => {
  it('extrai todos os campos do ICMSTot (regime normal)', async () => {
    const t = await extractTaxTotals(NFE_NORMAL);
    expect(t).not.toBeNull();
    expect(t).toMatchObject({
      vprod: 100, vbc: 95, vicms: 16.15,
      vbcSt: 0, vicmsSt: 0,
      vpis: 1.57, vcofins: 7.22, vipi: 4.75,
      vfrete: 10, vseg: 0, vdesc: 5, voutro: 0,
      vtottrib: 29.69, vfcp: 0, vnf: 109.75,
    });
  });

  it('prioriza vFCPUFDest sobre vFCP quando presente', async () => {
    const t = await extractTaxTotals(NFE_ST_FCP);
    // ICMSTot tem vFCPUFDest=2.50 (sem vFCP no total) → vfcp = 2.50
    expect(t?.vfcp).toBe(2.5);
    expect(t?.vbcSt).toBe(60);
    expect(t?.vicmsSt).toBe(10.2);
  });

  it('retorna campos null para tags ausentes (Simples, ICMSTot mínimo)', async () => {
    const t = await extractTaxTotals(NFE_SIMPLES);
    expect(t?.vprod).toBe(231.5);
    expect(t?.vnf).toBe(231.5);
    expect(t?.vicms).toBeNull();
    expect(t?.vpis).toBeNull();
  });

  it('retorna null para XML estruturalmente válido sem infNFe/ICMSTot', async () => {
    expect(await extractTaxTotals('<x/>')).toBeNull();
    expect(await extractTaxTotals('')).toBeNull();
    expect(await extractTaxTotals('<nfeProc><NFe><infNFe versao="4.00"></infNFe></NFe></nfeProc>')).toBeNull();
  });

  // Caracterização: XML malformado (não-XML) propaga o erro do parser em vez de
  // retornar null. Robustez a melhorar — a ingestão deveria tratar como null/[]
  // em vez de rejeitar. Painel 2026-07-22.
  it('propaga erro do parser para entrada não-XML (gap de robustez conhecido)', async () => {
    await expect(extractTaxTotals('não é xml <<<')).rejects.toThrow();
  });
});

describe('extractItemTaxes', () => {
  it('extrai imposto de item em regime normal (ICMS00 + IPI + PIS + COFINS)', async () => {
    const items = await extractItemTaxes(NFE_NORMAL);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      itemNumber: 1,
      productCode: 'P001', productDescription: 'Produto A',
      ncm: '30049099', cfop: '5102', cest: '1300100', origem: '0',
      quantity: 2, unitPrice: 50, totalValue: 100, itemDiscount: 5,
      cstIcms: '00', baseIcms: 95, aliqIcms: 17, valorIcms: 16.15,
      baseIcmsSt: null, valorIcmsSt: null,
      cstIpi: '50', aliqIpi: 5, baseIpi: 95, valorIpi: 4.75,
      cstPis: '01', aliqPis: 1.65, basePis: 95, valorPis: 1.57,
      cstCofins: '01', aliqCofins: 7.6, baseCofins: 95, valorCofins: 7.22,
    });
  });

  it('usa CSOSN como cstIcms no Simples Nacional e processa múltiplos itens (array)', async () => {
    const items = await extractItemTaxes(NFE_SIMPLES);
    expect(items).toHaveLength(2);
    // Item 1: ICMSSN102, CSOSN=102, sem valores de ICMS
    expect(items[0]).toMatchObject({
      itemNumber: 1, productCode: 'S1', cfop: '5405',
      cstIcms: '102', valorIcms: null, aliqIcms: null,
      cstPis: '07', valorPis: null, cstCofins: '07', valorCofins: null,
    });
    // Item 2: CSOSN=101; decimais com vírgula devem ser parseados
    expect(items[1]).toMatchObject({
      itemNumber: 2, productCode: 'S2', cstIcms: '101',
      unitPrice: 10.5, totalValue: 31.5,
    });
  });

  it('extrai ICMS-ST (ICMS60) e FCP (via ICMSUFDest.vFCPUFDest) com det único', async () => {
    const items = await extractItemTaxes(NFE_ST_FCP);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      cstIcms: '60',
      baseIcmsSt: 60, valorIcmsSt: 10.2,
      valorFcp: 2.5, // ICMSUFDest.vFCPUFDest tem prioridade sobre icms.vFCP (1.20)
      cstPis: '99', valorPis: 0.83,
      cstCofins: '99', valorCofins: 3.8,
    });
  });

  it('cai para icms.vFCP quando não há ICMSUFDest', async () => {
    const xml = NFE_ST_FCP.replace(/<ICMSUFDest>[\s\S]*?<\/ICMSUFDest>/, '');
    const items = await extractItemTaxes(xml);
    expect(items[0].valorFcp).toBe(1.2);
  });

  it('retorna [] para XML sem itens/inválido', async () => {
    expect(await extractItemTaxes('<x/>')).toEqual([]);
    expect(await extractItemTaxes('')).toEqual([]);
  });
});

describe('extractEmitterLocation', () => {
  it('extrai município e UF do enderEmit', async () => {
    expect(await extractEmitterLocation(NFE_NORMAL)).toEqual({ city: 'Campo Grande', state: 'MS' });
    expect(await extractEmitterLocation(NFE_ST_FCP)).toEqual({ city: 'Sao Paulo', state: 'SP' });
  });

  it('retorna null quando enderEmit ausente', async () => {
    expect(await extractEmitterLocation('<x/>')).toEqual({ city: null, state: null });
  });
});

describe('extractAllTaxData', () => {
  it('combina totais e itens numa chamada', async () => {
    const { totals, items } = await extractAllTaxData(NFE_NORMAL);
    expect(totals?.vnf).toBe(109.75);
    expect(items).toHaveLength(1);
    expect(items[0].productCode).toBe('P001');
  });
});
