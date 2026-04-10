import prisma from '@/lib/prisma';
import { getCfopCodesByTag } from '@/lib/cfop';
import { ensureInvoiceDuplicataTable } from '@/lib/invoice-duplicata-store';

export type FinanceiroDirection = 'received' | 'issued';
interface FinanceiroDuplicatasOptions {
  allowedTags?: string[];
}

export interface FinanceiroDuplicataBase {
  invoiceId: string;
  accessKey: string;
  nfNumero: string;
  partyCnpj: string;
  partyNome: string;
  nfEmissao: Date;
  nfValorTotal: number;
  faturaNumero: string;
  faturaValorOriginal: number;
  faturaValorLiquido: number;
  dupNumero: string;
  dupVencimento: string;
  dupValor: number;
}

interface DuplicataQueryRow {
  invoice_id: string;
  dup_numero: string | null;
  dup_vencimento: string;
  dup_valor: number;
  fatura_numero: string | null;
  fatura_valor_original: number | null;
  fatura_valor_liquido: number | null;
  accessKey: string;
  number: string;
  senderCnpj: string | null;
  senderName: string | null;
  recipientCnpj: string | null;
  recipientName: string | null;
  issueDate: Date;
  totalValue: number;
  cfop: string | null;
}

interface ImportFallbackRow {
  id: string;
  accessKey: string;
  number: string;
  senderCnpj: string | null;
  senderName: string | null;
  recipientCnpj: string | null;
  recipientName: string | null;
  issueDate: Date;
  totalValue: number;
}

interface FinanceiroCacheEntry {
  version: string;
  createdAt: number;
  duplicatas: FinanceiroDuplicataBase[];
}

const MAX_CACHE_ENTRIES = 16;
const IMPORT_NO_DUP_FALLBACK_DUE_DAYS = 47;
const FINANCEIRO_DUPLICATAS_CACHE_VERSION = 'v5';

const globalForFinanceiro = globalThis as unknown as {
  financeiroDuplicatasCache?: Map<string, FinanceiroCacheEntry>;
  financeiroDuplicatasInFlight?: Map<string, Promise<FinanceiroDuplicataBase[]>>;
};

const financeiroDuplicatasCache =
  globalForFinanceiro.financeiroDuplicatasCache ?? new Map<string, FinanceiroCacheEntry>();
const financeiroDuplicatasInFlight =
  globalForFinanceiro.financeiroDuplicatasInFlight ?? new Map<string, Promise<FinanceiroDuplicataBase[]>>();

if (process.env.NODE_ENV !== 'production') {
  globalForFinanceiro.financeiroDuplicatasCache = financeiroDuplicatasCache;
  globalForFinanceiro.financeiroDuplicatasInFlight = financeiroDuplicatasInFlight;
}

function toDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysUtc(date: Date, days: number): Date {
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + days
  ));
}

function getParty(
  row: { senderCnpj: string | null; senderName: string | null; recipientCnpj: string | null; recipientName: string | null },
  direction: FinanceiroDirection
) {
  if (direction === 'received') {
    return {
      cnpj: row.senderCnpj || '',
      nome: row.senderName || '',
    };
  }
  return {
    cnpj: row.recipientCnpj || '',
    nome: row.recipientName || '',
  };
}

function makeCacheKey(companyId: string, direction: FinanceiroDirection, allowedTags: string[]) {
  return `${companyId}:${direction}:${allowedTags.join('|')}`;
}

function getEffectiveTagByDirection(
  cfopTag: string | null,
  direction: FinanceiroDirection
): string | null {
  if (!cfopTag) return null;
  if (direction === 'received' && cfopTag === 'Venda') return 'Compra';
  return cfopTag;
}

/**
 * Returns the set of raw CFOP tags (before direction mapping) that would
 * produce an effective tag in `allowedTags` for the given direction.
 * This lets us pre-filter invoices by the DB `cfop` column.
 */
function getMatchingCfopCodes(
  allowedTags: string[],
  direction: FinanceiroDirection
): string[] {
  const rawTags: string[] = [];
  for (const tag of allowedTags) {
    const raw = direction === 'received' && tag === 'Compra' ? 'Venda' : tag;
    if (!rawTags.includes(raw)) rawTags.push(raw);
  }
  const codes: string[] = [];
  for (const rawTag of rawTags) {
    codes.push(...getCfopCodesByTag(rawTag));
  }
  return codes;
}

/**
 * Returns CFOP codes for import purchases specifically.
 */
function getImportCfopCodes(direction: FinanceiroDirection): string[] {
  const importTag = direction === 'received' ? 'Venda Importação' : 'Compra Importação';
  return getCfopCodesByTag(importTag);
}

function pruneCache() {
  if (financeiroDuplicatasCache.size <= MAX_CACHE_ENTRIES) return;
  const entries = Array.from(financeiroDuplicatasCache.entries());
  entries.sort((a, b) => a[1].createdAt - b[1].createdAt);
  while (entries.length > MAX_CACHE_ENTRIES) {
    const oldest = entries.shift();
    if (!oldest) break;
    financeiroDuplicatasCache.delete(oldest[0]);
  }
}

async function buildDuplicatas(
  companyId: string,
  direction: FinanceiroDirection,
  allowedTags: string[]
): Promise<FinanceiroDuplicataBase[]> {
  const matchingCfops = getMatchingCfopCodes(allowedTags, direction);
  const allDuplicatas: FinanceiroDuplicataBase[] = [];

  // Query 1: Read duplicatas from invoice_duplicata table (excludes sentinel rows)
  if (matchingCfops.length > 0) {
    const rows = await prisma.$queryRawUnsafe<DuplicataQueryRow[]>(
      `SELECT
        d.invoice_id,
        d.dup_numero,
        d.dup_vencimento,
        d.dup_valor,
        d.fatura_numero,
        d.fatura_valor_original,
        d.fatura_valor_liquido,
        i."accessKey",
        i."number",
        i."senderCnpj",
        i."senderName",
        i."recipientCnpj",
        i."recipientName",
        i."issueDate",
        i."totalValue"::double precision as "totalValue",
        i."cfop"
      FROM invoice_duplicata d
      INNER JOIN "Invoice" i ON i.id = d.invoice_id
      WHERE d.company_id = $1
        AND i.type = 'NFE'
        AND i.direction = $2
        AND d.dup_numero != '__NONE__'
        AND (i."cfop" = ANY($3::text[]) OR i."cfop" IS NULL)`,
      companyId,
      direction,
      matchingCfops,
    );

    for (const row of rows) {
      // For cfop=null rows, we include them conservatively (same as old behavior
      // where cfop=null invoices passed through the filter)
      const party = getParty(row, direction);
      allDuplicatas.push({
        invoiceId: row.invoice_id,
        accessKey: row.accessKey,
        nfNumero: row.number,
        partyCnpj: party.cnpj,
        partyNome: party.nome,
        nfEmissao: row.issueDate,
        nfValorTotal: row.totalValue,
        faturaNumero: row.fatura_numero || '',
        faturaValorOriginal: row.fatura_valor_original || 0,
        faturaValorLiquido: row.fatura_valor_liquido || 0,
        dupNumero: row.dup_numero || '',
        dupVencimento: row.dup_vencimento,
        dupValor: row.dup_valor,
      });
    }
  }

  // Query 2: Import purchase fallback — invoices with import CFOP that have
  // no actual duplicatas (only sentinel or no rows at all).
  // This preserves the "Compra Importacao" synthetic entry behavior.
  const effectiveImportTag = getEffectiveTagByDirection(
    direction === 'received' ? 'Venda Importação' : 'Compra Importação',
    direction
  );
  if (effectiveImportTag && allowedTags.includes(effectiveImportTag)) {
    const importCfops = getImportCfopCodes(direction);
    if (importCfops.length > 0) {
      const importRows = await prisma.$queryRawUnsafe<ImportFallbackRow[]>(
        `SELECT
          i.id,
          i."accessKey",
          i."number",
          i."senderCnpj",
          i."senderName",
          i."recipientCnpj",
          i."recipientName",
          i."issueDate",
          i."totalValue"::double precision as "totalValue"
        FROM "Invoice" i
        LEFT JOIN invoice_duplicata d ON d.invoice_id = i.id AND d.dup_numero != '__NONE__'
        WHERE i."companyId" = $1
          AND i.type = 'NFE'
          AND i.direction = $2
          AND i."cfop" = ANY($3::text[])
          AND i."totalValue" > 0
          AND d.invoice_id IS NULL`,
        companyId,
        direction,
        importCfops,
      );

      for (const row of importRows) {
        const party = getParty(row, direction);
        const totalNum = row.totalValue;
        const fallbackDueDate = addDaysUtc(row.issueDate, IMPORT_NO_DUP_FALLBACK_DUE_DAYS);
        allDuplicatas.push({
          invoiceId: row.id,
          accessKey: row.accessKey,
          nfNumero: row.number,
          partyCnpj: party.cnpj,
          partyNome: party.nome,
          nfEmissao: row.issueDate,
          nfValorTotal: totalNum,
          faturaNumero: '',
          faturaValorOriginal: totalNum,
          faturaValorLiquido: totalNum,
          dupNumero: 'IMP',
          dupVencimento: toDateKey(fallbackDueDate),
          dupValor: totalNum,
        });
      }
    }
  }

  return allDuplicatas;
}

export async function getFinanceiroDuplicatas(
  companyId: string,
  direction: FinanceiroDirection,
  options?: FinanceiroDuplicatasOptions
): Promise<FinanceiroDuplicataBase[]> {
  await ensureInvoiceDuplicataTable();

  const allowedTags = options?.allowedTags?.length
    ? Array.from(new Set(options.allowedTags))
    : ['Compra', 'Venda'];

  // Base filter: only NFE invoices for this company + direction.
  const baseWhere = { companyId, type: 'NFE' as const, direction };

  // Use _count + _max.createdAt + _sum.totalValue for cache versioning.
  const snapshot = await prisma.invoice.aggregate({
    where: baseWhere,
    _count: { _all: true },
    _max: { createdAt: true },
    _sum: { totalValue: true },
  });

  const version = `${FINANCEIRO_DUPLICATAS_CACHE_VERSION}:${snapshot._count._all}:${snapshot._max.createdAt?.toISOString() || 'none'}:${snapshot._sum.totalValue?.toString() || '0'}`;
  const cacheKey = makeCacheKey(companyId, direction, allowedTags);
  const cached = financeiroDuplicatasCache.get(cacheKey);
  if (cached && cached.version === version) {
    return cached.duplicatas;
  }

  const inFlightKey = `${cacheKey}:${version}`;
  const inFlight = financeiroDuplicatasInFlight.get(inFlightKey);
  if (inFlight) {
    return inFlight;
  }

  const promise = (async () => {
    const duplicatas = await buildDuplicatas(companyId, direction, allowedTags);
    financeiroDuplicatasCache.set(cacheKey, {
      version,
      createdAt: Date.now(),
      duplicatas,
    });
    pruneCache();
    return duplicatas;
  })();

  financeiroDuplicatasInFlight.set(inFlightKey, promise);
  try {
    return await promise;
  } finally {
    financeiroDuplicatasInFlight.delete(inFlightKey);
  }
}
