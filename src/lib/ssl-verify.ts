/**
 * Política única de verificação TLS para integrações SEFAZ/mTLS.
 * Default seguro: rejectUnauthorized=true.
 * Só desliga com SEFAZ_VERIFY_SSL=false (hotfix de cadeia incompleta).
 */
export function sefazRejectUnauthorized(): boolean {
  return process.env.SEFAZ_VERIFY_SSL !== 'false';
}
