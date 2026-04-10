import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { val, num } from '@/lib/xml-helpers';

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

interface BackfillBatchRow {
  id: string;
  xmlContent: string;
  companyId: string;
}

// ── Table init ──

type InitState = { promise?: Promise<void> };
const globalForDuplicata = globalThis as unknown as { invoiceDuplicataInitState?: InitState };
if (!globalForDuplicata.invoiceDuplicataInitState) globalForDuplicata.invoiceDuplicataInitState = {};
const initState = globalForDuplicata.invoiceDuplicataInitState;

export async function ensureInvoiceDuplicataTable(): Promise<void> {
  if (!initState.promise) {
    initState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS invoice_duplicata (
          id TEXT PRIMARY KEY,
          invoice_id TEXT NOT NULL,
          company_id TEXT NOT NULL,
          dup_numero TEXT,
          dup_vencimento TEXT NOT NULL,
          dup_valor DOUBLE PRECISION NOT NULL,
          fatura_numero TEXT,
          fatura_valor_original DOUBLE PRECISION,
          fatura_valor_liquido DOUBLE PRECISION,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(invoice_id, dup_numero, dup_vencimento)
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_invoice_duplicata_company
        ON invoice_duplicata(company_id)
      `);
      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_invoice_duplicata_invoice
        ON invoice_duplicata(invoice_id)
      `);
    })().catch((err) => {
      initState.promise = undefined;
      throw err;
    });
  }
  return initState.promise;
}

// ── XML extraction helpers (moved from financeiro-duplicatas.ts) ──

function extractTagValue(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>[\\s\\S]*?<\\/(?:\\w+:)?${tag}>`, 'i');
  const match = re.exec(xml);
  if (!match) return '';
  // Extract inner text (between opening and closing tags)
  const inner = match[0].replace(/<[^>]+>/g, '').trim();
  return inner;
}

export function extractDuplicatasFast(xmlContent: string): { hasDupTag: boolean; duplicatas: ParsedXmlDuplicata[] } {
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
  await ensureInvoiceDuplicataTable();

  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(
      `DELETE FROM invoice_duplicata WHERE invoice_id = $1`,
      invoiceId,
    );

    for (const dup of duplicatas) {
      const id = randomUUID();
      await tx.$executeRawUnsafe(
        `INSERT INTO invoice_duplicata (
          id, invoice_id, company_id, dup_numero, dup_vencimento, dup_valor,
          fatura_numero, fatura_valor_original, fatura_valor_liquido
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        id, invoiceId, companyId,
        dup.dupNumero, dup.dupVencimento, dup.dupValor,
        dup.faturaNumero, dup.faturaValorOriginal, dup.faturaValorLiquido,
      );
    }
  });
}

// ── Backfill ──

const BACKFILL_BATCH_SIZE = 500;
const BACKFILL_FETCH_SIZE = 100;

export async function backfillInvoiceDuplicatas(companyId: string): Promise<BackfillResult> {
  await ensureInvoiceDuplicataTable();

  // Find NFE invoices that have no rows in invoice_duplicata yet
  const missingIds = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT i.id FROM "Invoice" i
     LEFT JOIN invoice_duplicata d ON d.invoice_id = i.id
     WHERE i."companyId" = $1
       AND i.type = 'NFE'
       AND d.invoice_id IS NULL
     LIMIT $2`,
    companyId,
    BACKFILL_BATCH_SIZE,
  );

  if (missingIds.length === 0) {
    return { processed: 0, remaining: 0 };
  }

  const ids = missingIds.map((r) => r.id);
  let processed = 0;

  // Process in smaller fetch batches to avoid loading too much xmlContent at once
  for (let i = 0; i < ids.length; i += BACKFILL_FETCH_SIZE) {
    const batchIds = ids.slice(i, i + BACKFILL_FETCH_SIZE);
    const placeholders = batchIds.map((_, idx) => `$${idx + 1}`).join(',');
    const invoices = await prisma.$queryRawUnsafe<BackfillBatchRow[]>(
      `SELECT id, "xmlContent" as "xmlContent", "companyId" as "companyId"
       FROM "Invoice"
       WHERE id IN (${placeholders})`,
      ...batchIds,
    );

    for (const invoice of invoices) {
      const duplicatas = await extractDuplicatasFromXml(invoice.xmlContent || '');

      // For invoices with no duplicatas, insert a sentinel row so the LEFT JOIN
      // in the backfill query won't pick them up again on the next call.
      if (duplicatas.length === 0) {
        await prisma.$executeRawUnsafe(
          `INSERT INTO invoice_duplicata (
            id, invoice_id, company_id, dup_numero, dup_vencimento, dup_valor,
            fatura_numero, fatura_valor_original, fatura_valor_liquido
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          ON CONFLICT (invoice_id, dup_numero, dup_vencimento) DO NOTHING`,
          randomUUID(), invoice.id, companyId,
          '__NONE__', '__NONE__', 0,
          '', 0, 0,
        );
      } else {
        await upsertDuplicatas(invoice.id, companyId, duplicatas.map((d) => ({
          dupNumero: d.dupNumero,
          dupVencimento: d.dupVencimento,
          dupValor: d.dupValor,
          faturaNumero: d.faturaNumero,
          faturaValorOriginal: d.faturaValorOriginal,
          faturaValorLiquido: d.faturaValorLiquido,
        })));
      }
      processed++;
    }
  }

  // Count remaining unprocessed invoices
  const remainingResult = await prisma.$queryRawUnsafe<{ count: string }[]>(
    `SELECT COUNT(*)::text as count FROM "Invoice" i
     LEFT JOIN invoice_duplicata d ON d.invoice_id = i.id
     WHERE i."companyId" = $1
       AND i.type = 'NFE'
       AND d.invoice_id IS NULL`,
    companyId,
  );
  const remaining = parseInt(remainingResult[0]?.count || '0', 10);

  return { processed, remaining };
}
