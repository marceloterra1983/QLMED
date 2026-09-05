import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { CERTIDAO_KINDS_ORDER, CERTIDAO_LABEL } from './constants';
import { daysRemaining, selectVigente, statusFor, todayInSaoPaulo, toYmd } from './validity';

export type DocumentosRow = {
  id: string | null;
  kind: CompanyDocumentKind;
  label: string;
  fileName: string | null;
  validUntil: string | null;
  daysRemaining: number | null;
  status: { key: string; label: string };
  validUntilSource: string | null;
};

export type DocumentosListing = {
  certidoes: DocumentosRow[];
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

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  return String(value);
}

function toRow(row: DocumentosListSource, today: string): DocumentosRow {
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
    return vigente ? toRow(vigente, today) : missingRow(kind);
  });

  return {
    certidoes,
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
