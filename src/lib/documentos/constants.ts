import type { CompanyDocumentKind } from '@prisma/client';
import {
  DOCUMENTOS_FAMILIES,
  familyByCategory,
  kindConfig,
  type DocumentosCategory,
} from './families';

export type Kind = CompanyDocumentKind;
export type { DocumentosCategory };

export {
  DOCUMENTOS_FAMILIES,
  familyByCategory,
  familyForKind,
  familyScanTargets,
  kindConfig,
  kindExpires,
  labelForKind,
  lastPathSegment,
  thresholdsForKind,
  uploadFolderPath,
} from './families';

export const DOCUMENTOS_ONEDRIVE_ACCOUNT = 'faturamento@qlmed.com.br';

export const DOCUMENTOS_ONEDRIVE_ROOT = familyByCategory('certidao').root;

export const DOCUMENTOS_PAGE_PATH = '/cadastro/documentos';

export const DOCUMENTOS_INGEST_INTERVAL_MS = 60 * 60 * 1000;

/** Hora local do job diário de alerta (America/Sao_Paulo). */
export const DOCUMENTOS_ALERT_HOUR_LOCAL = 8;

/** Tick do scheduler de alerta: só age na hora local acima. */
export const DOCUMENTOS_ALERT_TICK_MS = 60 * 1000;

/** Limiares da família certidão — o default de `thresholdDue`. */
export const DOCUMENTOS_ALERT_THRESHOLDS = [30, 15, 7, 3, 1, 0] as const;

export const DOCUMENTOS_EXPIRED_REPEAT_DAYS = 7;

export const DOCUMENTOS_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;

/** Candidatas tentadas por pedido de backfill de emissão. */
export const DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT = 25;
/** Teto rígido — o cliente não pode pedir mais do que isto. */
export const DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_MAX = 100;

export const CERTIDAO_KINDS_ORDER = [
  'cnd_federal',
  'crf_fgts',
  'cndt',
  'cnd_estadual_ms',
  'cnd_estadual_mt',
  'cnd_municipal_mobiliario',
  'cnd_municipal_gerais',
] as const;

export const SANITARIA_KINDS_ORDER = [
  'alvara_funcionamento',
  'licenca_sanitaria',
  'licenca_sanitaria_veiculo',
  'crf_conselho',
  'controle_pragas',
  'afe_anvisa',
] as const;

export const CARTA_KIND = 'carta_comercializacao' as const;

/** Pasta existente em cada family.root — não criar; fail-closed se faltar. */
export const CERTIDAO_ARCHIVE_FOLDER = familyByCategory('certidao').archiveFolder;

function labelsFromFamilies(): Record<Kind, string> {
  const out = { outro: 'Outro' } as Record<Kind, string>;
  for (const family of DOCUMENTOS_FAMILIES) {
    for (const kind of family.kinds) {
      out[kind.kind] = kind.label;
    }
  }
  return out;
}

export const CERTIDAO_LABEL: Record<Kind, string> = labelsFromFamilies();

type CertidaoKind = (typeof CERTIDAO_KINDS_ORDER)[number];

function folderMap(): Record<CertidaoKind, string> {
  const out = {} as Record<CertidaoKind, string>;
  for (const kind of CERTIDAO_KINDS_ORDER) {
    const folder = kindConfig(kind)?.folder;
    if (!folder) throw new Error(`certidão ${kind} sem pasta`);
    out[kind] = folder;
  }
  return out;
}

function uploadNameMap(): Record<CertidaoKind, (ddMMyy: string) => string> {
  const out = {} as Record<CertidaoKind, (ddMMyy: string) => string>;
  for (const kind of CERTIDAO_KINDS_ORDER) {
    const uploadName = kindConfig(kind)?.uploadName;
    if (!uploadName) throw new Error(`certidão ${kind} sem uploadName`);
    out[kind] = uploadName;
  }
  return out;
}

function emissaoMap(): Record<CertidaoKind, string> {
  const out = {} as Record<CertidaoKind, string>;
  for (const kind of CERTIDAO_KINDS_ORDER) {
    const url = kindConfig(kind)?.emissaoUrl;
    if (!url) throw new Error(`certidão ${kind} sem emissaoUrl`);
    out[kind] = url;
  }
  return out;
}

export const CERTIDAO_FOLDER: Record<CertidaoKind, string> = folderMap();

export const CERTIDAO_UPLOAD_NAME: Record<CertidaoKind, (ddMMyy: string) => string> = uploadNameMap();

/**
 * Onde uma pessoa emite cada certidão. As URLs foram verificadas uma a uma no
 * spike de emissão automática (specs/042-cadastro-documentos-certidoes/SPIKE-emissao.md),
 * que concluiu que só a federal é automatizável (API paga do SERPRO) e que
 * TST, SEFAZ-MS e SEFAZ-MT ficam humanas por captcha. Enquanto for humano, o
 * mínimo que o sistema deve é levar a pessoa ao sítio certo em um clique.
 */
export const CERTIDAO_EMISSAO_URL: Record<CertidaoKind, string> = emissaoMap();

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


