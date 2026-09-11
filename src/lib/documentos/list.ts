import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { cartaLabelFromFileName, effectiveSocietarioKind, isWeakCartaLabel } from './classify';
import {
  DOCUMENTOS_FAMILIES,
  kindConfig,
  labelForKind,
  type DocumentosCategory,
} from './constants';
import { DOCUMENTOS_SHARE_RECIPIENTS } from './share-email';
import { DOCUMENTOS_WHATSAPP_RECIPIENTS } from './share-whatsapp';
import { automacaoOf, balancoYearFromName, type DocumentosAutomacao, type DocumentosFamily } from './families';
import { daysRemaining, selectVigente, statusFor, todayInSaoPaulo, toYmd } from './validity';

export type DocumentosRow = {
  id: string | null;
  kind: CompanyDocumentKind;
  category: DocumentosCategory;
  label: string;
  fileName: string | null;
  /** Cartas: fabricante exibido/editável; demais categorias: null. */
  manufacturer: string | null;
  validUntil: string | null;
  emitidoEm: string | null;
  daysRemaining: number | null;
  status: { key: string; label: string };
  validUntilSource: string | null;
  expira: boolean;
  emissaoUrl: string | null;
  emissaoAria: string | null;
  webUrl: string | null;
  automacao: DocumentosAutomacao | null;
};

/** Grupo anual do card Balanços (FR-026). */
export type DocumentosBalancoYear = {
  year: number;
  folderWebUrl: string | null;
  documents: DocumentosRow[];
};

export type DocumentosShareRecipientOption = { email: string; label: string };
export type DocumentosWhatsAppRecipientOption = { phone: string; label: string };

export type DocumentosListing = {
  certidoes: DocumentosRow[];
  sanitaria: DocumentosRow[];
  cartas: DocumentosRow[];
  societario: DocumentosRow[];
  basicos: DocumentosRow[];
  balancos: DocumentosBalancoYear[];
  ingest: { lastSuccessAt: string | null; lastError: string | null; lastErrorAt: string | null };
  shareRecipients: DocumentosShareRecipientOption[];
  whatsappRecipients: DocumentosWhatsAppRecipientOption[];
};

export type DocumentosListSource = {
  id: string;
  kind: CompanyDocumentKind;
  category?: string | null;
  fileName: string;
  folderName?: string | null;
  validUntil: Date | string | null;
  validUntilSource: string | null;
  emitidoEm?: Date | string | null;
  manufacturer?: string | null;
  removedAt: Date | string | null;
  webUrl?: string | null;
};

function erroAindaAtual(
  ingest: { lastSuccessAt: Date | string | null; lastError: string | null; lastErrorAt: Date | string | null } | null,
): boolean {
  if (!ingest?.lastError) return false;
  if (!ingest.lastErrorAt) return true; // sem carimbo, não dá para desqualificar
  if (!ingest.lastSuccessAt) return true;
  return new Date(ingest.lastErrorAt).getTime() > new Date(ingest.lastSuccessAt).getTime();
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

function isCategory(value: string | null | undefined): value is DocumentosCategory {
  return (
    value === 'certidao' ||
    value === 'sanitaria' ||
    value === 'carta' ||
    value === 'societario' ||
    value === 'basicos' ||
    value === 'balanco'
  );
}

function categoryOf(row: DocumentosListSource): DocumentosCategory {
  if (isCategory(row.category)) return row.category;
  const family = DOCUMENTOS_FAMILIES.find((item) => item.kinds.some((kind) => kind.kind === row.kind));
  return family?.category ?? 'certidao';
}

export function rowsForFamily(listing: DocumentosListing, category: DocumentosCategory): DocumentosRow[] {
  switch (category) {
    case 'certidao':
      return listing.certidoes;
    case 'sanitaria':
      return listing.sanitaria;
    case 'carta':
      return listing.cartas;
    case 'societario':
      return listing.societario;
    case 'basicos':
      return listing.basicos;
    case 'balanco':
      return listing.balancos.flatMap((group) => group.documents);
  }
}

function balancoDocumentLabel(fileName: string): string {
  return fileName.replace(/\.(pdf|zip)$/i, '').trim() || fileName;
}

function balancoYearOf(row: DocumentosListSource): number | null {
  return (
    balancoYearFromName(row.folderName ?? '') ??
    balancoYearFromName(row.fileName) ??
    null
  );
}

/** Pasta anual gravada como linha (legado) — só âncora de `folderWebUrl`, não é documento. */
function isBalancoFolderMarker(row: DocumentosListSource): boolean {
  return balancoYearFromName(row.fileName) != null && !/\.(pdf|zip)$/i.test(row.fileName);
}

function toRow(row: DocumentosListSource, today: string, family: DocumentosFamily): DocumentosRow {
  const config = kindConfig(row.kind);
  const expira = config?.expira ?? true;
  const ymd = expira ? toYmd(row.validUntil) : null;
  const days = expira && ymd ? daysRemaining(today, ymd) : null;
  const fromName = family.mode === 'open' ? cartaLabelFromFileName(row.fileName) : null;
  const label =
    family.mode === 'open'
      ? (row.manufacturer && !isWeakCartaLabel(row.manufacturer)
          ? row.manufacturer
          : fromName && !isWeakCartaLabel(fromName)
            ? fromName
            : (row.manufacturer ?? fromName ?? row.fileName))
      : (config?.label ?? labelForKind(row.kind));
  return {
    id: row.id,
    kind: row.kind,
    category: family.category,
    label,
    fileName: row.fileName,
    manufacturer: family.mode === 'open' ? (row.manufacturer ?? null) : null,
    validUntil: ymd,
    emitidoEm: toYmd(row.emitidoEm),
    daysRemaining: days,
    status: expira ? statusFor(days) : { key: 'nao_vence', label: 'não vence' },
    validUntilSource: expira ? row.validUntilSource : null,
    expira,
    emissaoUrl: config?.emissaoUrl ?? null,
    emissaoAria: config?.emissaoAria ?? null,
    webUrl: row.webUrl ?? null,
    automacao: automacaoOf(config),
  };
}

function missingRow(kind: CompanyDocumentKind, family: DocumentosFamily): DocumentosRow {
  const config = kindConfig(kind);
  return {
    id: null,
    kind,
    category: family.category,
    label: config?.label ?? labelForKind(kind),
    fileName: null,
    manufacturer: null,
    validUntil: null,
    emitidoEm: null,
    daysRemaining: null,
    status: { key: 'sem_data', label: 'Não encontrada' },
    validUntilSource: null,
    expira: config?.expira ?? true,
    emissaoUrl: config?.emissaoUrl ?? null,
    emissaoAria: config?.emissaoAria ?? null,
    webUrl: null,
    automacao: automacaoOf(config),
  };
}

function toBalancoDocumentRow(row: DocumentosListSource, family: DocumentosFamily): DocumentosRow {
  return {
    id: row.id,
    kind: row.kind,
    category: family.category,
    label: balancoDocumentLabel(row.fileName),
    fileName: row.fileName,
    manufacturer: null,
    validUntil: null,
    emitidoEm: toYmd(row.emitidoEm),
    daysRemaining: null,
    status: { key: 'nao_vence', label: 'não vence' },
    validUntilSource: null,
    expira: false,
    emissaoUrl: null,
    emissaoAria: null,
    webUrl: row.webUrl ?? null,
    automacao: null,
  };
}

function buildBalancoYears(
  family: DocumentosFamily,
  rows: DocumentosListSource[],
): DocumentosBalancoYear[] {
  const kinds = new Set(family.kinds.map((kind) => kind.kind));
  const ofFamily = rows.filter((row) => kinds.has(row.kind) && row.removedAt == null);
  const folderWebUrlByYear = new Map<number, string | null>();
  const documentsByYear = new Map<number, DocumentosRow[]>();

  for (const row of ofFamily) {
    const year = balancoYearOf(row);
    if (year == null) continue;
    if (isBalancoFolderMarker(row)) {
      if (!folderWebUrlByYear.has(year)) folderWebUrlByYear.set(year, row.webUrl ?? null);
      continue;
    }
    const list = documentsByYear.get(year) ?? [];
    list.push(toBalancoDocumentRow(row, family));
    documentsByYear.set(year, list);
    if (!folderWebUrlByYear.has(year) && row.webUrl && !/\.(pdf|zip)$/i.test(row.fileName)) {
      folderWebUrlByYear.set(year, row.webUrl);
    }
  }

  const years = new Set<number>([...documentsByYear.keys(), ...folderWebUrlByYear.keys()]);
  return [...years]
    .sort((a, b) => b - a)
    .map((year) => {
      const documents = (documentsByYear.get(year) ?? []).sort((a, b) =>
        a.label.localeCompare(b.label, 'pt-BR'),
      );
      return {
        year,
        folderWebUrl: folderWebUrlByYear.get(year) ?? null,
        documents,
      };
    })
    .filter((group) => group.documents.length > 0);
}

function buildClosedFamily(
  family: DocumentosFamily,
  rows: DocumentosListSource[],
  today: string,
): DocumentosRow[] {
  const kinds = family.kinds.map((kind) => kind.kind);
  const remapped = rows.map((row) => {
    if (family.category !== 'societario') return row;
    const kind = effectiveSocietarioKind(row.kind, row.fileName);
    return kind === row.kind ? row : { ...row, kind };
  });
  const ofFamily = remapped.filter((row) => kinds.includes(row.kind));
  const vigenteByKind = selectVigente(ofFamily);
  return kinds.map((kind) => {
    const vigente = vigenteByKind.get(kind);
    return vigente ? toRow(vigente, today, family) : missingRow(kind, family);
  });
}

function buildOpenFamily(
  family: DocumentosFamily,
  rows: DocumentosListSource[],
  today: string,
): DocumentosRow[] {
  const kinds = new Set(family.kinds.map((kind) => kind.kind));
  const listed = rows
    .filter((row) => kinds.has(row.kind) && row.removedAt == null)
    .map((row) => toRow(row, today, family));
  listed.sort((a, b) => {
    if (a.daysRemaining == null && b.daysRemaining == null) return a.label.localeCompare(b.label, 'pt-BR');
    if (a.daysRemaining == null) return 1;
    if (b.daysRemaining == null) return -1;
    return a.daysRemaining - b.daysRemaining;
  });
  return listed;
}

export function buildDocumentosListing(
  rows: DocumentosListSource[],
  ingest: {
    lastSuccessAt: Date | string | null;
    lastError: string | null;
    lastErrorAt: Date | string | null;
  } | null,
  now: Date = new Date(),
): DocumentosListing {
  const active = rows.filter((row) => row.removedAt == null);
  const today = todayInSaoPaulo(now);
  const byCategory = new Map<DocumentosCategory, DocumentosListSource[]>();
  for (const row of active) {
    const category = categoryOf(row);
    const list = byCategory.get(category);
    if (list) list.push(row);
    else byCategory.set(category, [row]);
  }

  const listingRows: Record<Exclude<DocumentosCategory, 'balanco'>, DocumentosRow[]> = {
    certidao: [],
    sanitaria: [],
    carta: [],
    societario: [],
    basicos: [],
  };
  let balancos: DocumentosBalancoYear[] = [];

  for (const family of DOCUMENTOS_FAMILIES) {
    const familyRows = byCategory.get(family.category) ?? [];
    if (family.scan === 'yearFolders') {
      balancos = buildBalancoYears(family, familyRows);
      continue;
    }
    listingRows[family.category as Exclude<DocumentosCategory, 'balanco'>] =
      family.mode === 'open'
        ? buildOpenFamily(family, familyRows, today)
        : buildClosedFamily(family, familyRows, today);
  }

  return {
    certidoes: listingRows.certidao,
    sanitaria: listingRows.sanitaria,
    cartas: listingRows.carta,
    societario: listingRows.societario,
    basicos: listingRows.basicos,
    balancos,
    ingest: {
      lastSuccessAt: toIso(ingest?.lastSuccessAt),
      /**
       * O erro só é atual se for MAIS RECENTE que o último sucesso. Sem esta
       * comparação, uma falha antiga — um tick de fundo que apanhou a janela de
       * um deploy, por exemplo — ficava na tela indefinidamente, colada ao
       * horário da última varredura BEM-SUCEDIDA. Lia-se como "a varredura das
       * 12:43 falhou" quando a das 12:53 tinha passado. Fez-me quase declarar
       * produção quebrada com produção sã.
       */
      lastError: erroAindaAtual(ingest) ? (ingest?.lastError ?? null) : null,
      lastErrorAt: erroAindaAtual(ingest) ? toIso(ingest?.lastErrorAt) : null,
    },
    shareRecipients: DOCUMENTOS_SHARE_RECIPIENTS.map(({ email, label }) => ({ email, label })),
    whatsappRecipients: DOCUMENTOS_WHATSAPP_RECIPIENTS.map(({ phone, label }) => ({ phone, label })),
  };
}

export async function loadDocumentosListing(
  companyId: string,
  now: Date = new Date(),
): Promise<DocumentosListing> {
  const [rows, ingest] = await Promise.all([
    prisma.companyDocument.findMany({
      where: { companyId, removedAt: null },
      select: {
        id: true,
        kind: true,
        category: true,
        fileName: true,
        folderName: true,
        validUntil: true,
        validUntilSource: true,
        emitidoEm: true,
        manufacturer: true,
        removedAt: true,
        webUrl: true,
      },
    }),
    prisma.companyDocumentIngestState.findUnique({
      where: { companyId },
      select: { lastSuccessAt: true, lastError: true, lastErrorAt: true },
    }),
  ]);
  return buildDocumentosListing(rows, ingest, now);
}
