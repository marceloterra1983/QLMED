/**
 * QLMED-FISCAL-004: a leitura antiga procurava o primeiro `cStat` da árvore e
 * casava com o do LOTE. Um lote 104 ("Lote processado") virava rejeição da
 * nota, o rascunho perdia número e chave, e a tentativa seguinte reemitia às
 * cegas. Estes testes fixam o contrário: quem decide é o `infProt`.
 */
import { describe, expect, it } from 'vitest';
import { interpretAutorizacaoResponse } from '@/lib/nfe-emission/autorizacao-client';

const ACCESS_KEY = '50260911222333000181550020000000071123456789';
const SIGNED = '<NFe xmlns="http://www.portalfiscal.inf.br/nfe"><infNFe Id="NFe' + ACCESS_KEY + '"/></NFe>';

function envelope(inner: string): string {
  return '<?xml version="1.0" encoding="utf-8"?>'
    + '<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body>'
    + '<nfeResultMsg xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeAutorizacao4">'
    + inner
    + '</nfeResultMsg></soap:Body></soap:Envelope>';
}

function args() {
  return { environment: 'production' as const, accessKey: ACCESS_KEY, signedNfeXml: SIGNED };
}

describe('interpretAutorizacaoResponse', () => {
  it('lote 104 com protocolo 100 é autorização, não rejeição', async () => {
    const xml = envelope(
      '<retEnviNFe versao="4.00"><tpAmb>1</tpAmb><verAplic>MS_1.0</verAplic>'
      + '<cStat>104</cStat><xMotivo>Lote processado</xMotivo><cUF>50</cUF>'
      + '<protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><verAplic>MS_1.0</verAplic>'
      + `<chNFe>${ACCESS_KEY}</chNFe><dhRecbto>2026-09-01T17:00:00-04:00</dhRecbto>`
      + '<nProt>150260000000123</nProt><digVal>abc=</digVal><cStat>100</cStat>'
      + '<xMotivo>Autorizado o uso da NF-e</xMotivo></infProt></protNFe></retEnviNFe>',
    );

    const result = await interpretAutorizacaoResponse(xml, args());

    expect(result.outcome).toBe('authorized');
    expect(result.cStat).toBe('100');
    expect(result.nProt).toBe('150260000000123');
    expect(result.xmlAutorizado).toContain(`<chNFe>${ACCESS_KEY}</chNFe>`);
    expect(result.xmlAutorizado).toContain('<nProt>150260000000123</nProt>');
    expect(result.xmlAutorizado).toContain('nfeProc');
  });

  it('rejeição da nota vem do infProt, com o cStat da nota', async () => {
    const xml = envelope(
      '<retEnviNFe versao="4.00"><cStat>104</cStat><xMotivo>Lote processado</xMotivo>'
      + '<protNFe versao="4.00"><infProt><cStat>539</cStat>'
      + '<xMotivo>Duplicidade de NF-e com diferenca na chave de acesso</xMotivo>'
      + '</infProt></protNFe></retEnviNFe>',
    );

    const result = await interpretAutorizacaoResponse(xml, args());

    expect(result.outcome).toBe('rejected');
    expect(result.cStat).toBe('539');
    expect(result.xmlAutorizado).toBeUndefined();
  });

  it('lote 103 sem protocolo é pendente — nunca rejeição', async () => {
    const xml = envelope(
      '<retEnviNFe versao="4.00"><cStat>103</cStat><xMotivo>Lote recebido com sucesso</xMotivo>'
      + '<infRec><nRec>501000000000123</nRec><tMed>1</tMed></infRec></retEnviNFe>',
    );

    const result = await interpretAutorizacaoResponse(xml, args());

    expect(result.outcome).toBe('pending');
    expect(result.cStat).toBe('103');
  });

  it('lote recusado sem protocolo é rejeição definitiva', async () => {
    const xml = envelope(
      '<retEnviNFe versao="4.00"><cStat>225</cStat>'
      + '<xMotivo>Falha no Schema XML do lote de NFe</xMotivo></retEnviNFe>',
    );

    const result = await interpretAutorizacaoResponse(xml, args());

    expect(result.outcome).toBe('rejected');
    expect(result.cStat).toBe('225');
  });

  it('resposta sem cStat nenhum fica pendente, não rejeitada', async () => {
    const result = await interpretAutorizacaoResponse(envelope('<retEnviNFe versao="4.00"/>'), args());

    expect(result.outcome).toBe('pending');
  });
});
