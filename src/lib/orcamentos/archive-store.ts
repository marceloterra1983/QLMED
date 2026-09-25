import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { extractPdfText } from '@/lib/pdf/extract-text';
import { moneyText } from './totals';
import { parseQuotePdfText, type ParsedQuote } from './parse-spica-pdf';

export const QUOTE_ARCHIVE_ROOT = '/home/marce/Cloud/onedrive/0 - ORÇAMENTOS';

export type QuoteArchiveOrigin = 'email' | 'arquivo';

function archiveStorageRoot(): string {
  return process.env.QUOTE_ARCHIVE_STORAGE_DIR || '/app/storage/orcamentos';
}

function isPathInsideRoot(filePath: string): boolean {
  const resolved = path.resolve(filePath);
  const root = path.resolve(QUOTE_ARCHIVE_ROOT);
  return resolved === root || resolved.startsWith(`${root}${path.sep}`);
}

export function quoteArchiveRelativePath(filePath: string): string | null {
  const root = path.resolve(QUOTE_ARCHIVE_ROOT);
  const resolved = path.resolve(filePath);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel;
}

/** OneDrive nesta máquina, depois a cópia no volume de runtime da vps2. */
export function quoteArchivePdfCandidates(filePath: string): string[] {
  const rel = quoteArchiveRelativePath(filePath);
  if (!rel) return [];
  const storageRoot = path.resolve(archiveStorageRoot());
  const mirrored = path.resolve(storageRoot, rel);
  if (mirrored !== storageRoot && !mirrored.startsWith(`${storageRoot}${path.sep}`)) return [];
  const original = path.resolve(QUOTE_ARCHIVE_ROOT, rel);
  return original === mirrored ? [original] : [original, mirrored];
}

export function serializeArchive(row: {
  id: string;
  number: number | null;
  numberLabel: string | null;
  issuedAt: Date | null;
  sourceKind: string;
  sourceMailbox: string | null;
  customerName: string;
  patientName: string | null;
  convenio: string | null;
  salesperson: string | null;
  total: Prisma.Decimal;
  _count?: { items: number };
}) {
  const origin: QuoteArchiveOrigin = row.sourceKind === 'email' ? 'email' : 'arquivo';
  return {
    id: row.id,
    number: row.number,
    numberLabel: row.numberLabel || (row.number ? String(row.number).padStart(8, '0') : 'sem número'),
    issuedAt: row.issuedAt ? row.issuedAt.toISOString().slice(0, 10) : '',
    status: 'issued' as const,
    customerName: row.customerName || '(sem cliente)',
    total: moneyText(row.total),
    patientName: row.patientName,
    convenio: row.convenio,
    salesperson: row.salesperson || row.sourceMailbox,
    origin,
    itemCount: row._count?.items ?? 0,
  };
}

export async function listQuoteArchives(
  companyId: string,
  query: { q?: string; take?: number },
) {
  const where: Prisma.QuoteArchiveWhereInput = { companyId };
  const q = (query.q || '').trim();
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      { patientName: { contains: q, mode: 'insensitive' } },
      { numberLabel: { contains: q, mode: 'insensitive' } },
      { convenio: { contains: q, mode: 'insensitive' } },
    ];
  }
  const rows = await prisma.quoteArchive.findMany({
    where,
    orderBy: [{ issuedAt: 'desc' }, { createdAt: 'desc' }],
    take: query.take,
    include: { _count: { select: { items: true } } },
  });
  return rows.map(serializeArchive);
}

export async function countQuoteArchives(companyId: string, query: { q?: string }) {
  const where: Prisma.QuoteArchiveWhereInput = { companyId };
  const q = (query.q || '').trim();
  if (q) {
    where.OR = [
      { customerName: { contains: q, mode: 'insensitive' } },
      { patientName: { contains: q, mode: 'insensitive' } },
      { numberLabel: { contains: q, mode: 'insensitive' } },
      { convenio: { contains: q, mode: 'insensitive' } },
    ];
  }
  return prisma.quoteArchive.count({ where });
}

export async function getQuoteArchive(companyId: string, id: string) {
  return prisma.quoteArchive.findFirst({ where: { id, companyId } });
}

export async function upsertQuoteArchiveFromPdf(input: {
  companyId: string;
  filePath: string;
  sourceKind: QuoteArchiveOrigin;
  sourceMailbox?: string | null;
  sourceSubject?: string | null;
}): Promise<{ id: string; skipped?: boolean; reason?: string } | null> {
  if (!isPathInsideRoot(input.filePath)) {
    return { id: '', skipped: true, reason: 'path_outside_root' };
  }
  const buf = await readFile(input.filePath);
  const sha256 = createHash('sha256').update(buf).digest('hex');
  const existing = await prisma.quoteArchive.findUnique({
    where: { companyId_sha256: { companyId: input.companyId, sha256 } },
    select: { id: true },
  });
  if (existing) return { id: existing.id, skipped: true, reason: 'duplicate' };
  const text = await extractPdfText(buf);
  const parsed = parseQuotePdfText(text);
  if (!parsed) return { id: '', skipped: true, reason: 'not_quote' };
  return persistParsedArchive(input.companyId, sha256, input, parsed);
}

async function persistParsedArchive(
  companyId: string,
  sha256: string,
  input: {
    filePath: string;
    sourceKind: QuoteArchiveOrigin;
    sourceMailbox?: string | null;
    sourceSubject?: string | null;
  },
  parsed: ParsedQuote,
) {
  const row = await prisma.quoteArchive.create({
    data: {
      companyId,
      sha256,
      number: parsed.number,
      numberLabel: parsed.numberLabel,
      issuedAt: parsed.issuedAt ? new Date(`${parsed.issuedAt}T00:00:00.000Z`) : null,
      layout: parsed.layout,
      sourceKind: input.sourceKind,
      sourceMailbox: input.sourceMailbox || null,
      sourcePath: input.filePath,
      sourceSubject: input.sourceSubject || null,
      customerCnpj: parsed.customerCnpj || '',
      customerName: parsed.customerName || '',
      salesperson: parsed.salesperson,
      patientName: parsed.patientName,
      doctorName: parsed.doctorName,
      convenio: parsed.convenio,
      local: parsed.local,
      notes: parsed.notes,
      freight: new Prisma.Decimal(parsed.freight || '0'),
      subtotal: new Prisma.Decimal(parsed.subtotal || parsed.total || '0'),
      total: new Prisma.Decimal(parsed.total || '0'),
      parseWarnings: parsed.warnings,
      items: {
        create: parsed.items.map((item) => ({
          companyId,
          lineNumber: item.lineNumber,
          code: item.code,
          description: item.description || item.code,
          rvs: item.rvs,
          ncm: item.ncm,
          unit: item.unit,
          quantity: new Prisma.Decimal(item.quantity || '1'),
          unitPrice: new Prisma.Decimal(item.unitPrice || '0'),
          discount: new Prisma.Decimal(item.discount || '0'),
          lineTotal: new Prisma.Decimal(item.lineTotal || '0'),
        })),
      },
    },
    select: { id: true },
  });
  return { id: row.id };
}

export { isPathInsideRoot };
