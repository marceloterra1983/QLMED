import { describe, expect, it } from 'vitest';
import { parseXmlSafe, parseXmlSafeNoMerge } from '@/lib/safe-xml-parser';
import { extractAllTaxData } from '@/lib/parse-invoice-tax';

function nfe(cnpj: string, number: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe>
    <infNFe Id="NFe352410${cnpj}5500100000${number.padStart(8, '0')}1123456789" versao="4.00">
      <ide><nNF>${number}</nNF><serie>1</serie></ide>
      <emit><CNPJ>${cnpj}</CNPJ><xNome>Emit ${number}</xNome></emit>
      <det nItem="1">
        <prod><cProd>P${number}</cProd><xProd>Item ${number}</xProd><qCom>1</qCom><vUnCom>10</vUnCom><vProd>10</vProd></prod>
      </det>
      <total><ICMSTot><vNF>10.00</vNF><vProd>10.00</vProd></ICMSTot></total>
    </infNFe>
  </NFe>
</nfeProc>`;
}

describe('parseXmlSafe concorrente', () => {
  it('não mistura CNPJ/número de NF-e distintas parseadas em paralelo', async () => {
    const a = nfe('12345678000191', '1111');
    const b = nfe('98765432000182', '2222');

    const jobs = Array.from({ length: 40 }, (_, i) => {
      const xml = i % 2 === 0 ? a : b;
      const expectedCnpj = i % 2 === 0 ? '12345678000191' : '98765432000182';
      const expectedNumber = i % 2 === 0 ? '1111' : '2222';
      return parseXmlSafe(xml).then((parsed) => {
        const inf = (parsed as {
          nfeProc: { NFe: { infNFe: { emit: { CNPJ: string }; ide: { nNF: string } } } };
        }).nfeProc.NFe.infNFe;
        expect(inf.emit.CNPJ).toBe(expectedCnpj);
        expect(inf.ide.nNF).toBe(expectedNumber);
      });
    });

    await Promise.all(jobs);
  });

  it('parseXmlSafeNoMerge também isola documentos paralelos', async () => {
    const a = nfe('11111111000191', '1');
    const b = nfe('22222222000182', '2');
    await Promise.all([
      parseXmlSafeNoMerge(a).then((parsed) => {
        const inf = (parsed as { nfeProc: { NFe: { infNFe: { emit: { CNPJ: string } } } } }).nfeProc.NFe.infNFe;
        expect(inf.emit.CNPJ).toBe('11111111000191');
      }),
      parseXmlSafeNoMerge(b).then((parsed) => {
        const inf = (parsed as { nfeProc: { NFe: { infNFe: { emit: { CNPJ: string } } } } }).nfeProc.NFe.infNFe;
        expect(inf.emit.CNPJ).toBe('22222222000182');
      }),
    ]);
  });

  it('extractAllTaxData em paralelo não perde totais (Promise.all interno)', async () => {
    const xml = nfe('12345678000191', '42');
    const results = await Promise.all(Array.from({ length: 20 }, () => extractAllTaxData(xml)));
    for (const result of results) {
      expect(result.totals?.vnf).toBe(10);
      expect(result.items[0]?.productCode).toBe('P42');
    }
  });
});
