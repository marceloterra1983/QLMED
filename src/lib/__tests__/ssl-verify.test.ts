import { afterEach, describe, expect, it } from 'vitest';
import { X509Certificate, createHash } from 'node:crypto';
import tls from 'node:tls';
import { ICP_BRASIL_V10_PEM, ICP_BRASIL_V10_SHA256 } from '@/lib/certs/icp-brasil-v10';
import {
  isSefazTlsTrustError,
  sefazCaBundle,
  sefazRejectUnauthorized,
} from '@/lib/ssl-verify';

describe('sefazRejectUnauthorized', () => {
  const prev = process.env.SEFAZ_VERIFY_SSL;

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
