import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { cartaLabelFromFileName } from './classify';
import {
  DOCUMENTOS_FAMILIES,
  kindConfig,
  labelForKind,
  type DocumentosCategory,
} from './constants';
import { balancoYearFromName, type DocumentosFamily } from './families';
import { daysRemaining, selectVigente, statusFor, todayInSaoPaulo, toYmd } from './validity';

export type DocumentosRow = {
  id: string | null;
  kind: CompanyDocumentKind;
  category: DocumentosCategory;
  label: string;
  fileName: string | null;
  validUntil: string | null;
  daysRemaining: number | null;
  status: { key: string; label: string };
  validUntilSource: string | null;
  expira: boolean;
  emissaoUrl: string | null;
  emissaoAria: string | null;
  webUrl: string | null;
};

export type DocumentosListing = {
  certidoes: DocumentosRow[];
  sanitaria: DocumentosRow[];
  cartas: DocumentosRow[];
  societario: DocumentosRow[];
  basicos: DocumentosRow[];
  balancos: DocumentosRow[];
  ingest: { lastSuccessAt: string | null; lastError: string | null };
};

export type DocumentosListSource = {
  id: string;
  kind: CompanyDocumentKind;
  category?: string | null;
  fileName: string;
  validUntil: Date | string | null;
  validUntilSource: string | null;
  removedAt: Date | string | null;
  webUrl?: string | null;
};

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
      return listing.balancos;
  }
}

function toRow(row: DocumentosListSource, today: string, family: DocumentosFamily): DocumentosRow {
  const config = kindConfig(row.kind);
  const expira = config?.expira ?? true;
  const ymd = expira ? toYmd(row.validUntil) : null;
  const days = expira && ymd ? daysRemaining(today, ymd) : null;
  const label =
    family.mode === 'open' ? cartaLabelFromFileName(row.fileName) : (config?.label ?? labelForKind(row.kind));
  return {
    id: row.id,
    kind: row.kind,
    category: family.category,
    label,
    fileName: row.fileName,
    validUntil: ymd,
    daysRemaining: days,
    status: expira ? statusFor(days) : { key: 'nao_vence', label: 'não vence' },
    validUntilSource: expira ? row.validUntilSource : null,
    expira,
    emissaoUrl: config?.emissaoUrl ?? null,
    emissaoAria: config?.emissaoAria ?? null,
    webUrl: row.webUrl ?? null,
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
    validUntil: null,
    daysRemaining: null,
    status: { key: 'sem_data', label: 'Não encontrada' },
    validUntilSource: null,
    expira: config?.expira ?? true,
    emissaoUrl: config?.emissaoUrl ?? null,
    emissaoAria: config?.emissaoAria ?? null,
    webUrl: null,
  };
}

function toYearRow(row: DocumentosListSource, family: DocumentosFamily): DocumentosRow {
  const year = balancoYearFromName(row.fileName);
  return {
    id: row.id,
    kind: row.kind,
    category: family.category,
    label: year != null ? String(year) : row.fileName,
    fileName: row.fileName,
    validUntil: null,
    daysRemaining: null,
    status: { key: 'nao_vence', label: 'não vence' },
    validUntilSource: null,
    expira: false,
    emissaoUrl: null,
    emissaoAria: null,
    webUrl: row.webUrl ?? null,
  };
}

function buildYearFolderFamily(
  family: DocumentosFamily,
  rows: DocumentosListSource[],
): DocumentosRow[] {
  const kinds = new Set(family.kinds.map((kind) => kind.kind));
  const listed = rows
    .filter((row) => kinds.has(row.kind) && row.removedAt == null)
    .map((row) => toYearRow(row, family));
  listed.sort((a, b) => {
    const yearA = Number.parseInt(a.label, 10);
    const yearB = Number.parseInt(b.label, 10);
    if (Number.isFinite(yearA) && Number.isFinite(yearB) && yearA !== yearB) return yearB - yearA;
    return b.label.localeCompare(a.label, 'pt-BR');
  });
  return listed;
}

function buildClosedFamily(
  family: DocumentosFamily,
  rows: DocumentosListSource[],
  today: string,
): DocumentosRow[] {
  const kinds = family.kinds.map((kind) => kind.kind);
  const ofFamily = rows.filter((row) => kinds.includes(row.kind));
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
  ingest: { lastSuccessAt: Date | string | null; lastError: string | null } | null,
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

  const listingRows: Record<DocumentosCategory, DocumentosRow[]> = {
    certidao: [],
    sanitaria: [],
    carta: [],
    societario: [],
    basicos: [],
    balanco: [],
  };

  for (const family of DOCUMENTOS_FAMILIES) {
    const familyRows = byCategory.get(family.category) ?? [];
    listingRows[family.category] =
      family.scan === 'yearFolders'
        ? buildYearFolderFamily(family, familyRows)
        : family.mode === 'open'
          ? buildOpenFamily(family, familyRows, today)
          : buildClosedFamily(family, familyRows, today);
  }

  return {
    certidoes: listingRows.certidao,
    sanitaria: listingRows.sanitaria,
    cartas: listingRows.carta,
    societario: listingRows.societario,
    basicos: listingRows.basicos,
    balancos: listingRows.balanco,
    ingest: {
      lastSuccessAt: toIso(ingest?.lastSuccessAt),
      lastError: ingest?.lastError ?? null,
    },
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
        validUntil: true,
        validUntilSource: true,
        removedAt: true,
        webUrl: true,
      },
    }),
    prisma.companyDocumentIngestState.findUnique({
      where: { companyId },
      select: { lastSuccessAt: true, lastError: true },
    }),
  ]);
  return buildDocumentosListing(rows, ingest, now);
}
