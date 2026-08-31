import { describe, expect, it } from 'vitest';
import forge from 'node-forge';
import { buildUnsignedNfeXml, draftTotalValue } from '@/lib/nfe-emission/xml-builder';
import { signNfeXml } from '@/lib/nfe-emission/xml-sign';
import { buildNfeAccessKey } from '@/lib/nfe-emission/access-key';
import type { NfeEmissionDraft } from '@/lib/nfe-emission/types';

function sampleDraft(over: Partial<NfeEmissionDraft> = {}): NfeEmissionDraft {
  const issueDate = new Date(2026, 7, 30, 10, 0, 0);
  const accessKey = buildNfeAccessKey({
    cUf: '50',
    issueDate,
    cnpj: '12345678000199',
    series: '1',
    number: '8',
    cNf: '11111111',
  });
  const ender = {
    xLgr: 'Rua A',
    nro: '10',
    xBairro: 'Centro',
    cMun: '5002704',
    xMun: 'Campo Grande',
    UF: 'MS',
    CEP: '79002000',
  };
  return {
    natureza: 'Venda de mercadoria',
    cfop: '5102',
    series: '1',
    number: '8',
    issueDate,
    finNFe: '1',
    indFinal: '1',
    indPres: '1',
    tpAmb: '2',
    modFrete: '9',
    accessKey,
    emit: {
      cnpj: '12345678000199',
      xNome: 'QLMED',
      ie: '123456789',
      crt: '1',
      ender,
    },
    dest: {
      cnpj: '98765432000188',
      xNome: 'Hospital Teste',
      ie: '112233',
      indIEDest: '1',
      ender: { ...ender, UF: 'MS' },
    },
    items: [{
      cProd: 'VALV-1',
      xProd: 'Valvula',
      ncm: '90213980',
      cfop: '5102',
      uCom: 'UN',
      qCom: '2',
      vUnCom: '10.005',
      anvisa: '8012345',
    }],
    ...over,
  };
}

describe('nfe xml builder', () => {
  it('inclui dest, itens, CFOP e ANVISA; total half-up', () => {
    expect(draftTotalValue(sampleDraft().items)).toBe('20.01');
    const xml = buildUnsignedNfeXml(sampleDraft());
    expect(xml).toContain('<CNPJ>98765432000188</CNPJ>');
    expect(xml).toContain('<CFOP>5102</CFOP>');
    expect(xml).toContain('<cProdANVISA>8012345</cProdANVISA>');
    expect(xml).toContain('NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO');
    expect(xml).toContain('<vNF>20.01</vNF>');
    expect(xml).toContain('<mod>55</mod>');
    expect(xml).toContain('<modFrete>9</modFrete>');
  });

  it('CRT 3 segue o DNA das emitidas: CST 40, PIS 01 0,65/3, boleto e CIF', () => {
    const xml = buildUnsignedNfeXml(sampleDraft({
      natureza: 'Venda merc.adq. ou recb. terc.',
      emit: {
        ...sampleDraft().emit,
        crt: '3',
      },
      dest: {
        ...sampleDraft().dest,
        indIEDest: '9',
      },
      items: sampleDraft().items.map((item) => ({ ...item, anvisa: undefined })),
      modFrete: '',
      pag: undefined,
    }));
    expect(xml).toContain('<CRT>3</CRT>');
    expect(xml).toContain('<ICMS40>');
    expect(xml).toContain('<CST>40</CST>');
    expect(xml).not.toContain('<CSOSN>');
    expect(xml).not.toContain('<CST>41</CST>');
    expect(xml).toContain('<PISAliq>');
    expect(xml).toContain('<CST>01</CST>');
    expect(xml).toContain('<pPIS>0.6500</pPIS>');
    expect(xml).toContain('<pCOFINS>3.0000</pCOFINS>');
    expect(xml).toContain('<tPag>15</tPag>');
    expect(xml).toContain('<indPag>1</indPag>');
    expect(xml).toContain('<modFrete>0</modFrete>');
    expect(xml).toContain('<nDup>001</nDup>');
    expect(xml).toMatch(/<vPIS>(?!0\.00<)/);
    expect(xml).toMatch(/<vCOFINS>(?!0\.00<)/);
  });

  it('devolução de consignação usa tPag 90 e não gera cobr', () => {
    const xml = buildUnsignedNfeXml(sampleDraft({
      natureza: 'Dev. de merc. rem. em consig.',
      cfop: '1918',
      finNFe: '4',
      emit: { ...sampleDraft().emit, crt: '3' },
      items: [{ ...sampleDraft().items[0], cfop: '1918', anvisa: undefined }],
    }));
    expect(xml).toContain('<finNFe>4</finNFe>');
    expect(xml).toContain('<tPag>90</tPag>');
    expect(xml).toContain('<vPag>0.00</vPag>');
    expect(xml).not.toContain('<cobr>');
  });

  it('grava pagamento PIX, frete e informações complementares', () => {
    const xml = buildUnsignedNfeXml(sampleDraft({
      vFrete: '5.00',
      pag: { indPag: '0', tPag: '17', vPag: '25.01' },
      infCpl: 'Pedido 88',
      infAdFisco: 'Texto fisco',
    }));
    expect(xml).toContain('<tPag>17</tPag>');
    expect(xml).toContain('<vFrete>5.00</vFrete>');
    expect(xml).toContain('<vNF>25.01</vNF>');
    expect(xml).toContain('<infCpl>Pedido 88</infCpl>');
    expect(xml).toContain('<infAdFisco>Texto fisco</infAdFisco>');
  });

  it('assina o XML com A1 de teste', () => {
    const keys = forge.pki.rsa.generateKeyPair(1024);
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date(Date.now() + 86400000);
    cert.setSubject([{ name: 'commonName', value: 'TEST:12345678000199' }]);
    cert.setIssuer([{ name: 'commonName', value: 'TEST' }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const signed = signNfeXml(
      buildUnsignedNfeXml(sampleDraft()),
      forge.pki.privateKeyToPem(keys.privateKey),
      forge.pki.certificateToPem(cert),
    );
    expect(signed).toContain('<Signature');
    expect(signed).toContain('<DigestValue>');
    expect(signed).toContain('</NFe>');
  });
});
