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
    indFinal: '1',
    indPres: '1',
    tpAmb: '2',
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
