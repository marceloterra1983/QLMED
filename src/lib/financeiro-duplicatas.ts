import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { parseXmlSafe } from '@/lib/safe-xml-parser';
import { extractFirstCfop, getCfopTagByCode } from '@/lib/cfop';

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

interface ParsedXmlDuplicata {
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

interface InvoiceBatchRow {
  id: string;
  accessKey: string;
  number: string;
  senderCnpj: string;
  senderName: string;
  recipientCnpj: string | null;
  recipientName: string | null;
  issueDate: Date;
  totalValue: number;
  xmlContent: string;
}

const BATCH_SIZE = 500;
const MAX_CACHE_ENTRIES = 16;
const IMPORT_NO_DUP_FALLBACK_DUE_DAYS = 47;
const FINANCEIRO_DUPLICATAS_CACHE_VERSION = 'v3';

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

function val(obj: any, ...keys: string[]): string {
  for (const key of keys) {
    if (obj?.[key] != null) return String(obj[key]);
  }
  return '';
}

function num(obj: any, key: string): number {
  const value = obj?.[key];
  if (value == null || value === '') return 0;
  return parseFloat(String(value).replace(',', '.')) || 0;
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

function extractTagValue(xml: string, tag: string): string {
  const re = new RegExp(`<(?:\\w+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:\\w+:)?${tag}>`, 'i');
  const match = re.exec(xml);
  return match ? match[1].trim() : '';
}

function extractDuplicatasFast(xmlContent: string): { hasDupTag: boolean; duplicatas: ParsedXmlDuplicata[] } {
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

async function extractDuplicatasFromXml(xmlContent: string): Promise<ParsedXmlDuplicata[]> {
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

function getParty(invoice: InvoiceBatchRow, direction: FinanceiroDirection) {
  if (direction === 'received') {
    return {
      cnpj: invoice.senderCnpj || '',
      nome: invoice.senderName || '',
    };
  }

  return {
    cnpj: invoice.recipientCnpj || '',
    nome: invoice.recipientName || '',
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

function isFinanceiroTagAllowed(tag: string | null, allowedTags: string[]): boolean {
  if (!tag) return false;
  return allowedTags.includes(tag);
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
  where: Prisma.InvoiceWhereInput,
  direction: FinanceiroDirection,
  allowedTags: string[]
): Promise<FinanceiroDuplicataBase[]> {
  const allDuplicatas: FinanceiroDuplicataBase[] = [];
  let cursorId: string | undefined;

  while (true) {
    const batch = await prisma.invoice.findMany({
      where,
      take: BATCH_SIZE,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      orderBy: { id: 'asc' },
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
        xmlContent: true,
      },
    });

    if (batch.length === 0) break;

    for (const invoice of batch) {
      const cfop = extractFirstCfop(invoice.xmlContent);
      const cfopTag = getCfopTagByCode(cfop);
      const effectiveTag = getEffectiveTagByDirection(cfopTag, direction);
      if (!isFinanceiroTagAllowed(effectiveTag, allowedTags)) continue;

      const parsedDuplicatas = await extractDuplicatasFromXml(invoice.xmlContent);
      const party = getParty(invoice, direction);
      if (parsedDuplicatas.length === 0) {
        // Import purchase NF-e often has no <dup>. Create one payable/receivable entry
        // based on invoice total. Use a fallback due date in the future so it
        // can be tracked in contas a pagar until formal installments are present.
        if (effectiveTag === 'Compra Importação' && invoice.totalValue > 0) {
          const fallbackDueDate = addDaysUtc(invoice.issueDate, IMPORT_NO_DUP_FALLBACK_DUE_DAYS);
          allDuplicatas.push({
            invoiceId: invoice.id,
            accessKey: invoice.accessKey,
            nfNumero: invoice.number,
            partyCnpj: party.cnpj,
            partyNome: party.nome,
            nfEmissao: invoice.issueDate,
            nfValorTotal: invoice.totalValue,
            faturaNumero: '',
            faturaValorOriginal: invoice.totalValue,
            faturaValorLiquido: invoice.totalValue,
            dupNumero: 'IMP',
            dupVencimento: toDateKey(fallbackDueDate),
            dupValor: invoice.totalValue,
          });
        }
        continue;
      }

      for (const dup of parsedDuplicatas) {
        allDuplicatas.push({
          invoiceId: invoice.id,
          accessKey: invoice.accessKey,
          nfNumero: invoice.number,
          partyCnpj: party.cnpj,
          partyNome: party.nome,
          nfEmissao: invoice.issueDate,
          nfValorTotal: invoice.totalValue,
          faturaNumero: dup.faturaNumero,
          faturaValorOriginal: dup.faturaValorOriginal,
          faturaValorLiquido: dup.faturaValorLiquido,
          dupNumero: dup.dupNumero,
          dupVencimento: dup.dupVencimento,
          dupValor: dup.dupValor,
        });
      }
    }

    cursorId = batch[batch.length - 1].id;
  }

  return allDuplicatas;
}

export async function getFinanceiroDuplicatas(
  companyId: string,
  direction: FinanceiroDirection,
  options?: FinanceiroDuplicatasOptions
): Promise<FinanceiroDuplicataBase[]> {
  const allowedTags = options?.allowedTags?.length
    ? Array.from(new Set(options.allowedTags))
    : ['Compra', 'Venda'];

  const where: Prisma.InvoiceWhereInput = {
    companyId,
    type: 'NFE',
    direction,
  };

  const snapshot = await prisma.invoice.aggregate({
    where,
    _count: { _all: true },
    _max: { updatedAt: true },
  });

  const version = `${FINANCEIRO_DUPLICATAS_CACHE_VERSION}:${snapshot._count._all}:${snapshot._max.updatedAt?.toISOString() || 'none'}`;
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
    const duplicatas = await buildDuplicatas(where, direction, allowedTags);
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
