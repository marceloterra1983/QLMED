import type { CompanyDocumentKind } from '@prisma/client';

export type Kind = CompanyDocumentKind;

export const DOCUMENTOS_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const DOCUMENTOS_ONEDRIVE_ROOT = '1 - DOCUMENTOS/1 - QL MED/2 - CERTIDÕES';

export const DOCUMENTOS_PAGE_PATH = '/cadastro/documentos';

export const DOCUMENTOS_INGEST_INTERVAL_MS = 60 * 60 * 1000;

/** Hora local do job diário de alerta (America/Sao_Paulo). */
export const DOCUMENTOS_ALERT_HOUR_LOCAL = 8;

/** Tick do scheduler de alerta: só age na hora local acima. */
export const DOCUMENTOS_ALERT_TICK_MS = 60 * 1000;

export const DOCUMENTOS_ALERT_THRESHOLDS = [30, 15, 7, 3, 1, 0] as const;

export const DOCUMENTOS_EXPIRED_REPEAT_DAYS = 7;

export const DOCUMENTOS_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

export const CERTIDAO_KINDS_ORDER = [
  'cnd_federal',
  'crf_fgts',
  'cndt',
  'cnd_estadual_ms',
  'cnd_estadual_mt',
  'cnd_municipal_mobiliario',
  'cnd_municipal_gerais',
] as const;

/** Pasta existente em DOCUMENTOS_ONEDRIVE_ROOT — não criar; fail-closed se faltar. */
export const CERTIDAO_ARCHIVE_FOLDER = 'Vencidas';

export const CERTIDAO_LABEL: Record<Kind, string> = {
  cnd_federal: 'CND Receita Federal',
  crf_fgts: 'CRF FGTS',
  cndt: 'CNDT (Débitos Trabalhistas)',
  cnd_estadual_ms: 'CND Estadual (MS)',
  cnd_estadual_mt: 'CND Estadual (MT)',
  cnd_municipal_mobiliario: 'CND Municipal — mobiliário',
  cnd_municipal_gerais: 'CND Municipal — débitos gerais',
  outro: 'Outro',
};

export const CERTIDAO_FOLDER: Record<Exclude<Kind, 'outro'>, string> = {
  cnd_federal: 'Federais',
  crf_fgts: 'FGTS',
  cndt: 'Débitos Trabalhistas',
  cnd_estadual_ms: 'Estaduais',
  cnd_estadual_mt: 'Estaduais',
  cnd_municipal_mobiliario: 'Municipais',
  cnd_municipal_gerais: 'Municipais',
};

export const CERTIDAO_UPLOAD_NAME: Record<Exclude<Kind, 'outro'>, (ddMMyy: string) => string> = {
  cnd_federal: (d) => `CERTIDAO RECEITA FEDERAL ${d} - QL MED.pdf`,
  crf_fgts: (d) => `CERTIDÃO FGTS ${d} QL MED.pdf`,
  cndt: (d) => `CERTIDÃO DEBITOS TRABALHISTA ${d}.pdf`,
  cnd_estadual_ms: (d) => `CERTIDAO ESTADUAL ${d} QL MED.pdf`,
  cnd_estadual_mt: (d) => `CERTIDÃO ESTADUAL DO MATO GROSSO ${d}.pdf`,
  cnd_municipal_mobiliario: (d) => `CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO ${d}.pdf`,
  cnd_municipal_gerais: (d) => `certidão débitos gerais val. ${d}.pdf`,
};

export function isDocumentosWhatsAppEnabled(): boolean {
  return (process.env.DOCUMENTOS_WHATSAPP_ENABLED ?? '').toLowerCase() === 'true';
}

/**
 * Destino próprio de Documentos, separado do grupo fiscal, para homologação
 * ir a um grupo de teste sem atingir o grupo de produção.
 */
export function getDocumentosWhatsAppGroupRaw(): string | null {
  // Sem fallback para o grupo fiscal. Sem destino próprio, o canal fica desligado.
  return process.env.DOCUMENTOS_WHATSAPP_GROUP_JID ?? null;
}
