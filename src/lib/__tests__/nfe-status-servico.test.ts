import { describe, expect, it } from 'vitest';
import { nfeAutorizacaoUrls } from '@/lib/nfe-emission/autorizacao-urls';
import { distDfeIsProduction, resolveEmissionEnvironment } from '@/lib/nfe-emission/environment';
import {
  assertCertificateReadyForSefaz,
  buildStatusServicoEnvelope,
  parseStatusServicoResponse,
} from '@/lib/nfe-emission/status-servico-client';
import { certificateEnvironmentSchema } from '@/lib/schemas/certificate';

describe('ambiente de emissão', () => {
  it('normaliza só homologation ou production', () => {
    expect(resolveEmissionEnvironment('homologation')).toBe('homologation');
    expect(resolveEmissionEnvironment('production')).toBe('production');
    expect(resolveEmissionEnvironment('prod')).toBe('production');
    expect(resolveEmissionEnvironment(null)).toBe('production');
  });

  it('valida o payload do seletor', () => {
    expect(certificateEnvironmentSchema.parse({ environment: 'homologation' }).environment).toBe('homologation');
    expect(certificateEnvironmentSchema.safeParse({ environment: 'homologacao' }).success).toBe(false);
  });

  it('mantém DistDFe operacional em produção', () => {
    expect(distDfeIsProduction()).toBe(true);
  });
});

describe('URLs NFeStatusServico4 MS', () => {
  it('aponta homologação e produção oficiais do MS', () => {
    expect(nfeAutorizacaoUrls('50', 'homologation').statusServico).toBe(
      'https://hom.nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
    );
    expect(nfeAutorizacaoUrls('50', 'production').statusServico).toBe(
      'https://nfe.sefaz.ms.gov.br/ws/NFeStatusServico4',
    );
  });

  it('recusa UF sem autorizador cadastrado', () => {
    expect(() => nfeAutorizacaoUrls('35', 'homologation')).toThrow(/UF 35/);
  });
});

describe('envelope e retorno StatusServico', () => {
  it('monta consStatServ sem lote de autorização', () => {
    const envelope = buildStatusServicoEnvelope('50', '2');
    expect(envelope).toContain('<xServ>STATUS</xServ>');
    expect(envelope).toContain('<tpAmb>2</tpAmb>');
    expect(envelope).toContain('<cUF>50</cUF>');
    expect(envelope).toContain('NFeStatusServico4');
    expect(envelope).not.toContain('enviNFe');
    expect(envelope).not.toContain('NFeAutorizacao');
  });

  it('lê cStat 107 e tMed do retConsStatServ', async () => {
    const xml = `<?xml version="1.0"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
  <soap:Body>
    <nfeStatusServicoNFResult xmlns="http://www.portalfiscal.inf.br/nfe/wsdl/NFeStatusServico4">
      <retConsStatServ versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">
        <tpAmb>2</tpAmb>
        <verAplic>MS</verAplic>
        <cStat>107</cStat>
        <xMotivo>Servico em Operacao</xMotivo>
        <cUF>50</cUF>
        <dhRecbto>2026-08-30T19:00:00-04:00</dhRecbto>
        <tMed>1</tMed>
      </retConsStatServ>
    </nfeStatusServicoNFResult>
  </soap:Body>
</soap:Envelope>`;
    const result = await parseStatusServicoResponse(xml);
    expect(result.cStat).toBe('107');
    expect(result.xMotivo).toBe('Servico em Operacao');
    expect(result.tMed).toBe('1');
    expect(result.cUF).toBe('50');
  });

  it('recusa resposta sem cStat', async () => {
    await expect(parseStatusServicoResponse('<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope"><soap:Body/></soap:Envelope>'))
      .rejects.toThrow(/inválida/);
  });
});

describe('pré-checagem do certificado', () => {
  it('recusa ausência e vencimento sem chamar SEFAZ', () => {
    expect(() => assertCertificateReadyForSefaz(null)).toThrow(/não configurado/);
    expect(() => assertCertificateReadyForSefaz({ validTo: new Date('2020-01-01') })).toThrow(/vencido/);
    expect(() => assertCertificateReadyForSefaz({ validTo: new Date('2099-01-01') })).not.toThrow();
  });
});
