import type { SefazEnvironment } from './autorizacao-urls';
import { createLogger } from '@/lib/logger';

const log = createLogger('nfe-emission/environment');

/**
 * Resolve o ambiente de emissão gravado no certificado.
 *
 * Antes: `value === 'homologation' ? 'homologation' : 'production'`. Qualquer
 * coisa que não fosse exatamente 'homologation' — um typo como 'homologacao',
 * um 'hom', um valor truncado — virava PRODUÇÃO em silêncio, e produção emite
 * NF-e de verdade. Agora só os dois valores do enum passam; o ausente segue
 * production porque esse é o default declarado no schema, e é intencional.
 * Auditoria FISCAL-010.
 */
export function resolveEmissionEnvironment(value: string | null | undefined): SefazEnvironment {
  if (value == null || value === '') return 'production';
  if (value === 'homologation' || value === 'production') return value;
  throw new Error(
    `Ambiente de emissão inválido: "${value}". Valores aceitos: "production", "homologation".`,
  );
}

/**
 * DistDFe usa outra série de NSU em homologação. O seletor do certificado
 * vale para emissão e StatusServico; a sync operacional permanece em produção.
 *
 * É decisão deliberada, não descuido: mudar o ambiente do DistDFe zera a série
 * de NSU e a sync perderia o ponto onde parou. A auditoria (FISCAL-010) pediu
 * que a divergência ficasse explícita quando o certificado está em homologação
 * e a sync continua em produção — daí o log.
 */
export function distDfeIsProduction(certificateEnvironment?: string | null): boolean {
  if (certificateEnvironment === 'homologation') {
    log.info(
      { certificateEnvironment, distDfeEnvironment: 'production' },
      'DistDFe permanece em produção com certificado em homologação (série de NSU é por ambiente)',
    );
  }
  return true;
}
