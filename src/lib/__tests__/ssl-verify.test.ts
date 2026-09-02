import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { X509Certificate, createHash } from 'node:crypto';
import tls from 'node:tls';
import { ICP_BRASIL_V10_PEM, ICP_BRASIL_V10_SHA256 } from '@/lib/certs/icp-brasil-v10';
import {
  isSefazTlsTrustError,
  receitaRequestTls,
  sefazCaBundle,
  sefazRejectUnauthorized,
  sefazRequestTls,
} from '@/lib/ssl-verify';

const logError = vi.hoisted(() => vi.fn());
vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: logError, warn: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

describe('sefazRejectUnauthorized', () => {
  const prev = process.env.SEFAZ_VERIFY_SSL;

  beforeEach(() => logError.mockClear());
  afterEach(() => {
    if (prev === undefined) delete process.env.SEFAZ_VERIFY_SSL;
    else process.env.SEFAZ_VERIFY_SSL = prev;
  });

  it('default é true (seguro)', () => {
    delete process.env.SEFAZ_VERIFY_SSL;
    expect(sefazRejectUnauthorized()).toBe(true);
  });

  it('só desliga com false explícito', () => {
    process.env.SEFAZ_VERIFY_SSL = 'false';
    expect(sefazRejectUnauthorized()).toBe(false);
    process.env.SEFAZ_VERIFY_SSL = 'true';
    expect(sefazRejectUnauthorized()).toBe(true);
  });

  // REAUD-B-18: o interruptor desliga a verificação do servidor num canal que
  // apresenta o e-CNPJ. Cada request feita assim tem de ficar em `error`, com o host.
  it('SEFAZ_VERIFY_SSL=false: cada request loga error com o host', () => {
    process.env.SEFAZ_VERIFY_SSL = 'false';
    sefazRequestTls('nfe.sefaz.ms.gov.br');
    sefazRequestTls('nfe.sefaz.ms.gov.br');
    expect(logError).toHaveBeenCalledTimes(2);
    expect(logError).toHaveBeenCalledWith({ host: 'nfe.sefaz.ms.gov.br' }, 'tls_verification_disabled');
  });

  it('com verificação ligada não há linha de error', () => {
    delete process.env.SEFAZ_VERIFY_SSL;
    sefazRequestTls('nfe.sefaz.ms.gov.br');
    expect(logError).not.toHaveBeenCalled();
  });
});

describe('receitaRequestTls', () => {
  const prev = process.env.RECEITA_NFSE_VERIFY_SSL;

  afterEach(() => {
    if (prev === undefined) delete process.env.RECEITA_NFSE_VERIFY_SSL;
    else process.env.RECEITA_NFSE_VERIFY_SSL = prev;
  });

  it('usa o mesmo bundle da SEFAZ (Mozilla + ICP-Brasil v10) e verifica por default', () => {
    delete process.env.RECEITA_NFSE_VERIFY_SSL;
    const opts = receitaRequestTls();
    expect(opts.rejectUnauthorized).toBe(true);
    expect(opts.ca).toEqual(sefazCaBundle());
  });

  it('só desliga com false explícito', () => {
    process.env.RECEITA_NFSE_VERIFY_SSL = 'false';
    expect(receitaRequestTls().rejectUnauthorized).toBe(false);
  });
});

describe('cadeia ICP-Brasil v10', () => {
  it('empacota a raiz oficial do ITI', () => {
    const cert = new X509Certificate(ICP_BRASIL_V10_PEM);
    expect(cert.subject).toContain('Autoridade Certificadora Raiz Brasileira v10');
    const fp = createHash('sha256').update(cert.raw).digest('hex').toUpperCase();
    expect(fp).toBe(ICP_BRASIL_V10_SHA256);
  });

  it('anexa a raiz v10 sem descartar as CAs do runtime', () => {
    const bundle = sefazCaBundle();
    expect(bundle).toHaveLength(tls.rootCertificates.length + 1);
    expect(bundle[bundle.length - 1]).toBe(ICP_BRASIL_V10_PEM);
    expect(bundle.slice(0, tls.rootCertificates.length)).toEqual([...tls.rootCertificates]);
  });

  it('reconhece falha de emissor TLS da SEFAZ', () => {
    expect(isSefazTlsTrustError({ code: 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY' })).toBe(true);
    expect(isSefazTlsTrustError(new Error('outra coisa'))).toBe(false);
  });
});
