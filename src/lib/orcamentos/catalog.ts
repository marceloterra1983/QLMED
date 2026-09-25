import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { flexMatchAll, normalizeForSearch } from '@/lib/utils';
import { preferDecimalNumber } from '@/lib/money';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

export type QuoteClienteHit = {
  cnpj: string;
  name: string;
  /** Nome abreviado do cadastro (ContactNickname). A lista mostra este antes da razão. */
  shortName: string | null;
  ie: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

/**
 * 0 = o nome abreviado começa pelo termo; 1 = o termo cabe no abreviado;
 * 2 = só razão, CNPJ ou sem apelido. Sem Jev: a regra é contém/prefixo,
 * não classificação de texto livre.
 */
export function rankQuoteCliente(
  query: string,
  row: { name: string; shortName: string | null },
): number {
  const q = normalizeForSearch(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 2;
  const nick = (row.shortName || '').trim();
  if (!nick || !flexMatchAll([nick], words)) return 2;
  return normalizeForSearch(nick).startsWith(q) ? 0 : 1;
}

export function orderQuoteClientes<T extends { cnpj: string; name: string; shortName: string | null }>(
  rows: T[],
  query: string,
): T[] {
  return [...rows].sort((a, b) => {
    const byRank = rankQuoteCliente(query, a) - rankQuoteCliente(query, b);
    if (byRank !== 0) return byRank;
    const labelA = (a.shortName || a.name).trim();
    const labelB = (b.shortName || b.name).trim();
    return labelA.localeCompare(labelB, 'pt-BR') || a.cnpj.localeCompare(b.cnpj);
  });
}

export type QuoteProdutoHit = {
  id: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string | null;
  rvs: string | null;
  unitPrice: string;
};

function isDigitQuery(query: string): boolean {
  const only = digits(query);
  return only.length >= 3 && query.replace(/[\s./-]/g, '') === only;
}

/** CNPJ gravado com ou sem máscara entra na mesma busca. */
function lookupKeys(value: string): string[] {
  const raw = value.trim();
  const only = digits(raw);
  if (!raw) return [];
  if (!only || only === raw) return [raw];
  return [raw, only];
}

async function loadNicknameMap(companyId: string): Promise<Map<string, string>> {
  const rows = await prisma.contactNickname.findMany({
    where: { companyId },
    select: { cnpj: true, shortName: true },
  });
  const map = new Map<string, string>();
  for (const row of rows) {
    const nick = row.shortName.trim();
    const key = digits(row.cnpj);
    if (!nick || key.length !== 14) continue;
    map.set(key, nick);
  }
  return map;
}

export async function searchQuoteClientes(
  companyId: string,
  q: string,
  limit: number,
): Promise<QuoteClienteHit[]> {
  const query = q.trim();
  const qDigits = digits(query);
  const textQuery = query.length > 0 && !isDigitQuery(query);
  const nicknames = textQuery ? await loadNicknameMap(companyId) : new Map<string, string>();
  const words = textQuery ? normalizeForSearch(query).split(/\s+/).filter(Boolean) : [];
  const nickCnpjs = textQuery
    ? orderQuoteClientes(
        [...nicknames.entries()]
          .filter(([, nick]) => flexMatchAll([nick], words))
          .map(([cnpj, shortName]) => ({ cnpj, name: shortName, shortName })),
        query,
      )
        .slice(0, 80)
        .flatMap((row) => lookupKeys(row.cnpj))
    : [];

  const issued = {
    companyId,
    type: 'NFE' as const,
    direction: 'issued' as const,
    recipientCnpj: { not: null },
  };
  const select = { recipientCnpj: true, recipientName: true };
  const [byName, byNick] = await Promise.all([
    prisma.invoice.findMany({
      where: {
        ...issued,
        ...(query
          ? {
              OR: [
                { recipientName: { contains: query, mode: 'insensitive' } },
                ...(qDigits.length >= 3 ? [{ recipientCnpj: { contains: qDigits } }] : []),
              ],
            }
          : {}),
      },
      select,
      distinct: ['recipientCnpj'],
      take: 200,
      orderBy: { recipientName: 'asc' },
    }),
    nickCnpjs.length > 0
      ? prisma.invoice.findMany({
          where: { ...issued, recipientCnpj: { in: nickCnpjs } },
          select,
          distinct: ['recipientCnpj'],
          take: 80,
        })
      : Promise.resolve([]),
  ]);

  const names = new Map<string, string>();
  for (const row of [...byNick, ...byName]) {
    const cnpj = digits(row.recipientCnpj || '');
    if (cnpj.length !== 14 || names.has(cnpj)) continue;
    names.set(cnpj, (row.recipientName || cnpj).trim());
  }
  if (names.size === 0) return [];

  let shortByCnpj = nicknames;
  if (!textQuery) {
    const keys = [...names.keys()].flatMap(lookupKeys);
    const rows = await prisma.contactNickname.findMany({
      where: { companyId, cnpj: { in: keys } },
      select: { cnpj: true, shortName: true },
    });
    shortByCnpj = new Map();
    for (const row of rows) {
      const nick = row.shortName.trim();
      const key = digits(row.cnpj);
      if (nick && key) shortByCnpj.set(key, nick);
    }
  }

  const ordered = (query
    ? orderQuoteClientes(
        [...names.entries()].map(([cnpj, name]) => ({
          cnpj,
          name,
          shortName: shortByCnpj.get(cnpj) || null,
        })),
        query,
      )
    : [...names.entries()].map(([cnpj, name]) => ({
        cnpj,
        name,
        shortName: shortByCnpj.get(cnpj) || null,
      }))
  ).slice(0, limit);

  const cnpjs = ordered.map((row) => row.cnpj);
  const storedKeys = cnpjs.flatMap(lookupKeys);
  const [fiscals, overrides] = await Promise.all([
    prisma.contactFiscal.findMany({
      where: { companyId, cnpj: { in: storedKeys } },
      select: { cnpj: true, ie: true, city: true, uf: true },
    }),
    prisma.contactOverride.findMany({
      where: { companyId, cnpj: { in: storedKeys } },
      select: {
        cnpj: true,
        street: true,
        number: true,
        district: true,
        city: true,
        state: true,
        zipCode: true,
      },
    }),
  ]);
  const fiscalBy = new Map(fiscals.map((row) => [digits(row.cnpj), row]));
  const overrideBy = new Map(overrides.map((row) => [digits(row.cnpj), row]));

  return ordered.map((row) => {
    const fiscal = fiscalBy.get(row.cnpj);
    const override = overrideBy.get(row.cnpj);
    return {
      cnpj: row.cnpj,
      name: row.name,
      shortName: row.shortName,
      ie: fiscal?.ie || null,
      street: override?.street || null,
      number: override?.number || null,
      district: override?.district || null,
      city: override?.city || fiscal?.city || null,
      state: override?.state || fiscal?.uf || null,
      zip: override?.zipCode || null,
    };
  });
}

export async function searchQuoteProdutos(
  companyId: string,
  q: string,
  limit: number,
  lineStatus: 'active' | 'all',
): Promise<QuoteProdutoHit[]> {
  const where: Prisma.ProductRegistryWhereInput = { companyId };
  if (lineStatus === 'active') {
    where.OR = [{ outOfLine: null }, { outOfLine: false }];
  }
  const search = q.trim();
  if (search) {
    const normalized = normalizeForSearch(search);
    where.AND = [
      {
        OR: [
          { description: { contains: normalized, mode: 'insensitive' } },
          { code: { contains: normalized, mode: 'insensitive' } },
          { codigo: { contains: normalized, mode: 'insensitive' } },
          { ncm: { contains: normalized, mode: 'insensitive' } },
          { anvisaCode: { contains: normalized, mode: 'insensitive' } },
          { aggSearchText: { contains: normalized } },
        ],
      },
    ];
  }

  const rows = await prisma.productRegistry.findMany({
    where,
    take: limit,
    orderBy: { description: 'asc' },
    select: {
      id: true,
      code: true,
      codigo: true,
      description: true,
      ncm: true,
      unit: true,
      anvisaCode: true,
      aggLastSalePrice: true,
      aggLastPrice: true,
    },
  });

  return rows.map((row) => {
    const sale = preferDecimalNumber(null, row.aggLastSalePrice);
    const purchase = preferDecimalNumber(null, row.aggLastPrice);
    const unitPrice = sale ?? purchase ?? 0;
    return {
      id: row.id,
      code: (row.codigo || row.code || '').trim() || row.id.slice(-8),
      description: row.description,
      ncm: row.ncm,
      unit: row.unit,
      rvs: row.anvisaCode,
      unitPrice: unitPrice.toFixed(2),
    };
  });
}
