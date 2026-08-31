import tls from 'node:tls';
import { ICP_BRASIL_V10_PEM } from '@/lib/certs/icp-brasil-v10';

/**
 * Política única de verificação TLS para integrações SEFAZ/mTLS.
 * Default seguro: rejectUnauthorized=true.
 * Só desliga com SEFAZ_VERIFY_SSL=false (hotfix de cadeia incompleta).
 *
 * A SEFAZ-MS (hom e prod) encadeia em ICP-Brasil v10, que não está no
 * bundle Mozilla do Node. `ca` no https.request substitui o store padrão,
 * então a raiz v10 é anexada às CAs do runtime — não a substitui.
 */
export function sefazRejectUnauthorized(): boolean {
  return process.env.SEFAZ_VERIFY_SSL !== 'false';
}

export function sefazCaBundle(): string[] {
  return [...tls.rootCertificates, ICP_BRASIL_V10_PEM];
}

export function sefazRequestTls(): { rejectUnauthorized: boolean; ca: string[] } {
  return {
    rejectUnauthorized: sefazRejectUnauthorized(),
    ca: sefazCaBundle(),
  };
}

export function isSefazTlsTrustError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as { code?: string; message?: string };
  return rec.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
    || rec.message === 'unable to get local issuer certificate';
}
