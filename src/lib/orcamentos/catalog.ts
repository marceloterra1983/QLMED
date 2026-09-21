import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { normalizeForSearch } from '@/lib/utils';
import { preferDecimalNumber } from '@/lib/money';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

export type QuoteClienteHit = {
  cnpj: string;
  name: string;
  ie: string | null;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
};

export type QuoteProdutoHit = {
  id: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string | null;
  rvs: string | null;
  unitPrice: string;
};

export async function searchQuoteClientes(
  companyId: string,
  q: string,
  limit: number,
): Promise<QuoteClienteHit[]> {
  const query = q.trim();
  const qDigits = digits(query);
  const invoices = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'issued',
      recipientCnpj: { not: null },
      ...(query
        ? {
            OR: [
              { recipientName: { contains: query, mode: 'insensitive' } },
              ...(qDigits.length >= 3 ? [{ recipientCnpj: { contains: qDigits } }] : []),
            ],
          }
        : {}),
    },
    select: { recipientCnpj: true, recipientName: true },
    distinct: ['recipientCnpj'],
    take: 200,
    orderBy: { recipientName: 'asc' },
  });

  const cnpjs: string[] = [];
  const names = new Map<string, string>();
  for (const row of invoices) {
    const cnpj = digits(row.recipientCnpj || '');
    if (cnpj.length !== 14 || names.has(cnpj)) continue;
    names.set(cnpj, (row.recipientName || cnpj).trim());
    cnpjs.push(cnpj);
    if (cnpjs.length >= limit) break;
  }
  if (cnpjs.length === 0) return [];

  const [fiscals, overrides] = await Promise.all([
    prisma.contactFiscal.findMany({
      where: { companyId, cnpj: { in: cnpjs } },
      select: { cnpj: true, ie: true, city: true, uf: true },
    }),
    prisma.contactOverride.findMany({
      where: { companyId, cnpj: { in: cnpjs } },
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
  const fiscalBy = new Map(fiscals.map((row) => [row.cnpj, row]));
  const overrideBy = new Map(overrides.map((row) => [row.cnpj, row]));

  return cnpjs.map((cnpj) => {
    const fiscal = fiscalBy.get(cnpj);
    const override = overrideBy.get(cnpj);
    return {
      cnpj,
      name: names.get(cnpj) || cnpj,
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
