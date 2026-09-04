import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { CERTIDAO_KINDS_ORDER, CERTIDAO_LABEL } from './constants';
import { daysRemaining, selectVigente, statusFor, todayInSaoPaulo } from './validity';

export type DocumentosHistoryItem = {
  id: string;
  fileName: string;
  validUntil: string | null;
};

export type DocumentosRow = {
  id: string | null;
  kind: CompanyDocumentKind;
  label: string;
  fileName: string | null;
  validUntil: string | null;
  daysRemaining: number | null;
  status: { key: string; label: string };
  validUntilSource: string | null;
  history: DocumentosHistoryItem[];
};

export type DocumentosListing = {
  certidoes: DocumentosRow[];
  outros: DocumentosRow[];
  ingest: { lastSuccessAt: string | null; lastError: string | null };
};

export type DocumentosListSource = {
  id: string;
  kind: CompanyDocumentKind;
  fileName: string;
  validUntil: Date | string | null;
  validUntilSource: string | null;
  removedAt: Date | string | null;
};

function toYmd(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return match?.[1] ?? null;
  }
  if (Number.isNaN(value.getTime())) return null;
  return value.toISOString().slice(0, 10);
}

function compareYmdDesc(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return a < b ? 1 : -1;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

function toHistory(row: DocumentosListSource): DocumentosHistoryItem {
  return {
    id: row.id,
    fileName: row.fileName,
    validUntil: toYmd(row.validUntil),
  };
}

function toRow(
  row: DocumentosListSource,
  history: DocumentosHistoryItem[],
  today: string,
): DocumentosRow {
  const ymd = toYmd(row.validUntil);
  const days = ymd ? daysRemaining(today, ymd) : null;
  return {
    id: row.id,
    kind: row.kind,
    label: CERTIDAO_LABEL[row.kind],
    fileName: row.fileName,
    validUntil: ymd,
    daysRemaining: days,
    status: statusFor(days),
    validUntilSource: row.validUntilSource,
    history,
  };
}

function missingRow(kind: (typeof CERTIDAO_KINDS_ORDER)[number]): DocumentosRow {
  return {
    id: null,
    kind,
    label: CERTIDAO_LABEL[kind],
    fileName: null,
    validUntil: null,
    daysRemaining: null,
    status: { key: 'sem_data', label: 'Não encontrada' },
    validUntilSource: null,
    history: [],
  };
}

export function buildDocumentosListing(
  rows: DocumentosListSource[],
  ingest: { lastSuccessAt: Date | string | null; lastError: string | null } | null,
  now: Date = new Date(),
): DocumentosListing {
  const active = rows.filter((row) => row.removedAt == null);
  const vigenteByKind = selectVigente(active);
  const today = todayInSaoPaulo(now);

  const certidoes = CERTIDAO_KINDS_ORDER.map((kind) => {
    const vigente = vigenteByKind.get(kind);
    if (!vigente) return missingRow(kind);
    const history = active
      .filter((row) => row.kind === kind && row.id !== vigente.id)
      .sort((a, b) => compareYmdDesc(toYmd(a.validUntil), toYmd(b.validUntil)))
      .map(toHistory);
    return toRow(vigente, history, today);
  });

  const outros = active
    .filter((row) => row.kind === 'outro')
    .sort((a, b) => {
      const byDate = compareYmdDesc(toYmd(a.validUntil), toYmd(b.validUntil));
      if (byDate !== 0) return byDate;
      return a.fileName.localeCompare(b.fileName);
    })
    .map((row) => toRow(row, [], today));

  return {
    certidoes,
    outros,
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
        fileName: true,
        validUntil: true,
        validUntilSource: true,
        removedAt: true,
      },
    }),
    prisma.companyDocumentIngestState.findUnique({
      where: { companyId },
      select: { lastSuccessAt: true, lastError: true },
    }),
  ]);
  return buildDocumentosListing(rows, ingest, now);
}
