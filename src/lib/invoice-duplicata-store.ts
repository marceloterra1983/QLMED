import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { val, num } from '@/lib/xml-helpers';
import { resolveInvoiceXmlContent } from '@/lib/xml-file-store';

// ── Types ──

export interface DuplicataInput {
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
}

interface ParsedXmlDuplicata {
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
}

interface BackfillResult {
  processed: number;
  remaining: number;
}

// invoice_duplicata is schema-owned (Phase 11 baseline). No CREATE/ALTER at runtime.

// ── XML extraction helpers ──

function extractTagValue(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  const inner = match[0].replace(/<[^>]+>/g, '').trim();
  return inner;
}

export function extractDuplicatasFast(xmlContent: string): {
  hasDupTag: boolean;
  duplicatas: ParsedXmlDuplicata[];
} {
  const lower = xmlContent.toLowerCase();
  if (!lower.includes('<dup') && !lower.includes(':dup')) {
    return { hasDupTag: false, duplicatas: [] };
  }

  const cobrMatch = /<(?:\w+:)?cobr\b[\s\S]*?<\/(?:\w+:)?cobr>/i.exec(xmlContent);
  if (!cobrMatch) {
    return { hasDupTag: true, duplicatas: [] };
  }

  const cobrXml = cobrMatch[0];
  const fatMatch = /<(?:\w+:)?fat\b[\s\S]*?<\/(?:\w+:)?fat>/i.exec(cobrXml);
  const fatXml = fatMatch ? fatMatch[0] : '';

  const faturaNumero = fatXml ? extractTagValue(fatXml, 'nFat') : '';
  const faturaValorOriginal = fatXml
    ? parseFloat((extractTagValue(fatXml, 'vOrig') || '0').replace(',', '.')) || 0
    : 0;
  const faturaValorLiquido = fatXml
    ? parseFloat((extractTagValue(fatXml, 'vLiq') || '0').replace(',', '.')) || 0
    : 0;

  const duplicatas: ParsedXmlDuplicata[] = [];
  const dupRegex = /<(?:\w+:)?dup\b[\s\S]*?<\/(?:\w+:)?dup>/gi;
  let hasDupTag = false;
  let dupMatch: RegExpExecArray | null;

  while ((dupMatch = dupRegex.exec(cobrXml)) !== null) {
    hasDupTag = true;
    const dupXml = dupMatch[0];
    const vencimento = extractTagValue(dupXml, 'dVenc');
    const valor = parseFloat((extractTagValue(dupXml, 'vDup') || '0').replace(',', '.')) || 0;
    if (!vencimento || valor === 0) continue;

    duplicatas.push({
      faturaNumero,
      faturaValorOriginal,
      faturaValorLiquido,
      dupNumero: extractTagValue(dupXml, 'nDup'),
      dupVencimento: vencimento,
      dupValor: valor,
    });
  }

  return { hasDupTag, duplicatas };
}

async function extractDuplicatasFallback(xmlContent: string): Promise<ParsedXmlDuplicata[]> {
  const result = await parseXmlSafe(xmlContent);
  const nfeProc = result.nfeProc;
  const nfe = nfeProc ? nfeProc.NFe : result.NFe;
  const infNFe = nfe?.infNFe;
  if (!infNFe) return [];

  const cobr = infNFe.cobr;
  if (!cobr) return [];

  const fat = cobr.fat;
  const dupItems = cobr.dup;
  if (!dupItems) return [];

  const dupList = Array.isArray(dupItems) ? dupItems : [dupItems];
  const parsed: ParsedXmlDuplicata[] = [];

  for (const dup of dupList) {
    const vencimento = val(dup, 'dVenc');
    const valor = num(dup, 'vDup');
    if (!vencimento || valor === 0) continue;

    parsed.push({
      faturaNumero: fat ? val(fat, 'nFat') : '',
      faturaValorOriginal: fat ? num(fat, 'vOrig') : 0,
      faturaValorLiquido: fat ? num(fat, 'vLiq') : 0,
      dupNumero: val(dup, 'nDup'),
      dupVencimento: vencimento,
      dupValor: valor,
    });
  }

  return parsed;
}

export async function extractDuplicatasFromXml(xmlContent: string): Promise<ParsedXmlDuplicata[]> {
  const fastResult = extractDuplicatasFast(xmlContent);
  if (fastResult.duplicatas.length > 0 || !fastResult.hasDupTag) {
    return fastResult.duplicatas;
  }

  try {
    return await extractDuplicatasFallback(xmlContent);
  } catch {
    return [];
  }
}

// ── Upsert duplicatas ──

export async function upsertDuplicatas(
  invoiceId: string,
  companyId: string,
  duplicatas: DuplicataInput[],
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.invoiceDuplicata.deleteMany({ where: { invoiceId } });

    if (duplicatas.length === 0) return;

    await tx.invoiceDuplicata.createMany({
      data: duplicatas.map((dup) => ({
        id: randomUUID(),
        invoiceId,
        companyId,
        dupNumero: dup.dupNumero,
        dupVencimento: dup.dupVencimento,
        dupValor: dup.dupValor,
        faturaNumero: dup.faturaNumero,
        faturaValorOriginal: dup.faturaValorOriginal,
        faturaValorLiquido: dup.faturaValorLiquido,
      })),
    });
  });
}

// ── Backfill ──

const BACKFILL_BATCH_SIZE = 500;
const BACKFILL_FETCH_SIZE = 100;

export async function backfillInvoiceDuplicatas(companyId: string): Promise<BackfillResult> {
  // Paginate NFE invoices and collect those without any invoice_duplicata row
  const ids: string[] = [];
  const pageSize = 500;
  let cursor: string | undefined;
  while (ids.length < BACKFILL_BATCH_SIZE) {
    const page = await prisma.invoice.findMany({
      where: { companyId, type: 'NFE' },
      orderBy: [{ issueDate: 'desc' }, { id: 'desc' }],
      take: pageSize,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true },
    });
    if (page.length === 0) break;
    cursor = page[page.length - 1].id;
    const pageIds = page.map((p) => p.id);
    const existing = await prisma.invoiceDuplicata.findMany({
      where: { invoiceId: { in: pageIds } },
      select: { invoiceId: true },
      distinct: ['invoiceId'],
    });
    const hasDup = new Set(existing.map((e) => e.invoiceId));
    for (const id of pageIds) {
      if (!hasDup.has(id)) {
        ids.push(id);
        if (ids.length >= BACKFILL_BATCH_SIZE) break;
      }
    }
    if (page.length < pageSize) break;
  }

  if (ids.length === 0) {
    return { processed: 0, remaining: 0 };
  }

  let processed = 0;

  for (let i = 0; i < ids.length; i += BACKFILL_FETCH_SIZE) {
    const batchIds = ids.slice(i, i + BACKFILL_FETCH_SIZE);
    const invoices = await prisma.invoice.findMany({
      where: { id: { in: batchIds } },
      select: {
        id: true,
        accessKey: true,
        type: true,
        issueDate: true,
        xmlContent: true,
        companyId: true,
      },
    });

    for (const invoice of invoices) {
      const xml = await resolveInvoiceXmlContent(invoice);
      const duplicatas = await extractDuplicatasFromXml(xml || '');

      // Sentinel row so the LEFT JOIN won't re-pick invoices with no dups
      if (duplicatas.length === 0) {
        await prisma.invoiceDuplicata.createMany({
          data: [
            {
              id: randomUUID(),
              invoiceId: invoice.id,
              companyId,
              dupNumero: '__NONE__',
              dupVencimento: '__NONE__',
              dupValor: 0,
              faturaNumero: '',
              faturaValorOriginal: 0,
              faturaValorLiquido: 0,
            },
          ],
          skipDuplicates: true,
        });
      } else {
        await upsertDuplicatas(
          invoice.id,
          companyId,
          duplicatas.map((d) => ({
            dupNumero: d.dupNumero,
            dupVencimento: d.dupVencimento,
            dupValor: d.dupValor,
            faturaNumero: d.faturaNumero,
            faturaValorOriginal: d.faturaValorOriginal,
            faturaValorLiquido: d.faturaValorLiquido,
          })),
        );
      }
      processed++;
    }
  }

  const [totalNfe, withDup] = await Promise.all([
    prisma.invoice.count({ where: { companyId, type: 'NFE' } }),
    prisma.invoiceDuplicata.groupBy({
      by: ['invoiceId'],
      where: { companyId },
      _count: true,
    }),
  ]);
  const remaining = Math.max(0, totalNfe - withDup.length);

  return { processed, remaining };
}
