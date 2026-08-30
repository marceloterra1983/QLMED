import type { SefazEnvironment } from './autorizacao-urls';

export function resolveEmissionEnvironment(value: string | null | undefined): SefazEnvironment {
  return value === 'homologation' ? 'homologation' : 'production';
}

/**
 * DistDFe usa outra série de NSU em homologação. O seletor do certificado
 * vale para emissão e StatusServico; a sync operacional permanece em produção.
 */
export function distDfeIsProduction(): boolean {
  return true;
}
