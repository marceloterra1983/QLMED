import prisma from '@/lib/prisma';
import { getCfopCodesByTag } from '@/lib/cfop';
import type { Decimal } from '@prisma/client-runtime-utils';
import { backfillInvoiceDuplicatas } from '@/lib/invoice-duplicata-store';

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

/**
 * QLMED-DATA-005: invoice_duplicata guarda cada valor duas vezes — a coluna
 * `Float` legada e o sidecar `Decimal` escrito pelo dual-write da SPEC-004. A
 * leitura financeira usava só o `Float`, o que joga fora a precisão que o
 * write path pagou para ter. O sidecar manda; o Float é o fallback das linhas
 * gravadas antes do expand.
 */
function preferDecimal(decimal: Decimal | null | undefined, legacyFloat: number | null | undefined): number {
  if (decimal != null) return Number(decimal);
  return legacyFloat ?? 0;
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

  // Query 1: Read duplicatas from invoice_duplicata (excludes sentinel rows)
  if (matchingCfops.length > 0) {
    const invoices = await prisma.invoice.findMany({
      where: {
        companyId,
        type: 'NFE',
        direction,
        OR: [{ cfop: { in: matchingCfops } }, { cfop: null }],
      },
      select: {
        id: true,
        accessKey: true,
        number: true,
        senderCnpj: true,
        senderName: true,
        recipientCnpj: true,
        recipientName: true,
        issueDate: true,
        totalValue: true,
        cfop: true,
      },
    });
    const invoiceById = new Map(invoices.map((i) => [i.id, i]));
    const invoiceIds = invoices.map((i) => i.id);

    if (invoiceIds.length > 0) {
      const dups = await prisma.invoiceDuplicata.findMany({
        where: {
          companyId,
          invoiceId: { in: invoiceIds },
          NOT: { dupNumero: '__NONE__' },
        },
      });

      for (const d of dups) {
        const inv = invoiceById.get(d.invoiceId);
        if (!inv?.issueDate) continue;
        const party = getParty(inv, direction);
        allDuplicatas.push({
          invoiceId: d.invoiceId,
          accessKey: inv.accessKey || '',
          nfNumero: inv.number || '',
          partyCnpj: party.cnpj,
          partyNome: party.nome,
          nfEmissao: inv.issueDate,
          nfValorTotal: Number(inv.totalValue || 0),
          faturaNumero: d.faturaNumero || '',
          faturaValorOriginal: preferDecimal(d.faturaValorOriginalDecimal, d.faturaValorOriginal),
          faturaValorLiquido: preferDecimal(d.faturaValorLiquidoDecimal, d.faturaValorLiquido),
          dupNumero: d.dupNumero || '',
          dupVencimento: d.dupVencimento,
          dupValor: preferDecimal(d.dupValorDecimal, d.dupValor),
        });
      }
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
      const candidates = await prisma.invoice.findMany({
        where: {
          companyId,
          type: 'NFE',
          direction,
          cfop: { in: importCfops },
          totalValue: { gt: 0 },
        },
        select: {
          id: true,
          accessKey: true,
          number: true,
          senderCnpj: true,
          senderName: true,
          recipientCnpj: true,
          recipientName: true,
          issueDate: true,
          totalValue: true,
        },
      });
      const candidateIds = candidates.map((c) => c.id);
      const withRealDups = new Set<string>();
      if (candidateIds.length > 0) {
        const realDups = await prisma.invoiceDuplicata.findMany({
          where: {
            invoiceId: { in: candidateIds },
            NOT: { dupNumero: '__NONE__' },
          },
          select: { invoiceId: true },
          distinct: ['invoiceId'],
        });
        for (const d of realDups) withRealDups.add(d.invoiceId);
      }
      const importRows = candidates.filter((c) => !withRealDups.has(c.id));

      for (const row of importRows) {
        if (!row.issueDate) continue;
        const party = getParty(row, direction);
        const totalNum = Number(row.totalValue || 0);
        const fallbackDueDate = addDaysUtc(row.issueDate, IMPORT_NO_DUP_FALLBACK_DUE_DAYS);
        allDuplicatas.push({
          invoiceId: row.id,
          accessKey: row.accessKey || '',
          nfNumero: row.number || '',
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

export interface FinanceiroDuplicatasCoverage {
  /** NF-e da empresa. */
  nfeCount: number;
  /** Quantas delas já têm linha de duplicata extraída do XML. */
  withDuplicatas: number;
  /** Quantas ainda faltam. Zero = cobertura histórica completa. */
  remaining: number;
}

/**
 * Quanto do histórico de NF-e já foi convertido em duplicatas.
 *
 * Auditoria b177b07 (QLMED-UI-002): o backfill é preguiçoso e limitado a um
 * lote de 500 XML por GET (ver `backfillInvoiceDuplicatas`). Enquanto o
 * histórico não fecha, a tela do financeiro mostra menos contas do que
 * existem — e não dizia nada. Quem abria "Contas a pagar" via um total que
 * parecia completo e não era. O número é caro de esconder e barato de mostrar.
 */
export async function getFinanceiroDuplicatasCoverage(
  companyId: string
): Promise<FinanceiroDuplicatasCoverage> {
  const [nfeCount, dupGroups] = await Promise.all([
    prisma.invoice.count({ where: { companyId, type: 'NFE' } }),
    prisma.invoiceDuplicata.groupBy({
      by: ['invoiceId'],
      where: { companyId },
      _count: true,
    }),
  ]);

  const withDuplicatas = dupGroups.length;
  return {
    nfeCount,
    withDuplicatas,
    remaining: Math.max(0, nfeCount - withDuplicatas),
  };
}

export async function getFinanceiroDuplicatas(
  companyId: string,
  direction: FinanceiroDirection,
  options?: FinanceiroDuplicatasOptions
): Promise<FinanceiroDuplicataBase[]> {

  const allowedTags = options?.allowedTags?.length
    ? Array.from(new Set(options.allowedTags))
    : ['Compra', 'Venda'];

  // Base filter: only NFE invoices for this company + direction.
  const baseWhere = { companyId, type: 'NFE' as const, direction };

  // Cache version includes duplicata coverage so each backfill batch invalidates.
  const [snapshot, nfeCount, dupGroups] = await Promise.all([
    prisma.invoice.aggregate({
      where: baseWhere,
      _count: { _all: true },
      _max: { createdAt: true },
      _sum: { totalValue: true },
    }),
    prisma.invoice.count({ where: { companyId, type: 'NFE' } }),
    prisma.invoiceDuplicata.groupBy({
      by: ['invoiceId'],
      where: { companyId },
      _count: true,
    }),
  ]);
  const remaining = Math.max(0, nfeCount - dupGroups.length);

  const version = `${FINANCEIRO_DUPLICATAS_CACHE_VERSION}:${snapshot._count._all}:${snapshot._max.createdAt?.toISOString() || 'none'}:${snapshot._sum.totalValue?.toString() || '0'}:${dupGroups.length}`;
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
    // Lazy backfill one batch when any NFE still lacks a duplicata row.
    // ponytail: one batch/GET (500 XML). Remaining fills on later loads.
    if (remaining > 0) {
      await backfillInvoiceDuplicatas(companyId);
    }
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
