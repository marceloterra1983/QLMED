import tls from 'node:tls';
import { createLogger } from '@/lib/logger';
import { ICP_BRASIL_V10_PEM } from '@/lib/certs/icp-brasil-v10';

const log = createLogger('ssl-verify');

/**
 * Política única de verificação TLS para os canais mTLS (SEFAZ e Receita).
 * Default seguro: rejectUnauthorized=true.
 *
 * O interruptor `*_VERIFY_SSL=false` existe como hotfix de cadeia incompleta
 * e continua a existir — mas desliga a verificação do servidor num canal que
 * apresenta o e-CNPJ, por isso TODA request feita assim fica em `error` com o
 * host (re-auditoria REAUD-B-18). Ele não devia ser necessário: a raiz
 * ICP-Brasil v10, que não está no bundle Mozilla do Node, vai anexada às CAs
 * do runtime nos dois canais. `ca` no https.request SUBSTITUI o store padrão,
 * então o bundle anexa a raiz — não a substitui.
 */
export function noteTlsVerificationDisabled(host: string | undefined): void {
  log.error({ host }, 'tls_verification_disabled');
}

export function sefazRejectUnauthorized(host?: string): boolean {
  const reject = process.env.SEFAZ_VERIFY_SSL !== 'false';
  if (!reject) noteTlsVerificationDisabled(host);
  return reject;
}

export function sefazCaBundle(): string[] {
  return [...tls.rootCertificates, ICP_BRASIL_V10_PEM];
}

/** Chamar por request, com o host: é isso que faz o log de verificação desligada existir. */
export function sefazRequestTls(host?: string): { rejectUnauthorized: boolean; ca: string[] } {
  return {
    rejectUnauthorized: sefazRejectUnauthorized(host),
    ca: sefazCaBundle(),
  };
}

/**
 * Mesmo bundle da SEFAZ para o canal da Receita. O log por request fica no
 * `ReceitaNfseClient`, que é quem conhece o host na hora de cada chamada.
 */
export function receitaRequestTls(): { rejectUnauthorized: boolean; ca: string[] } {
  return {
    rejectUnauthorized: process.env.RECEITA_NFSE_VERIFY_SSL !== 'false',
    ca: sefazCaBundle(),
  };
}

export function isSefazTlsTrustError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const rec = error as { code?: string; message?: string };
  return rec.code === 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'
    || rec.message === 'unable to get local issuer certificate';
}
