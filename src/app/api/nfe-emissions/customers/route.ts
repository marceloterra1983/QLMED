import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import {
  buildIssuedCustomerWhere,
  formatDestinatarioAddressLine,
  isCnpjLikeSearch,
  mergeDestinatarioAddressSources,
} from '@/lib/nfe-emission/customer-search';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const search = new URL(req.url).searchParams.get('search') || '';
    const term = search.trim();

    let extraCnpjs: string[] = [];
    if (term && !isCnpjLikeSearch(term)) {
      const nicks = await prisma.contactNickname.findMany({
        where: {
          companyId: company.id,
          shortName: { contains: term, mode: 'insensitive' },
        },
        select: { cnpj: true },
        take: 30,
      });
      extraCnpjs = [...new Set(nicks.flatMap((row) => {
        const raw = row.cnpj;
        const only = digits(raw);
        return only && only !== raw ? [raw, only] : [raw];
      }))];
    }

    const rows = await prisma.invoice.findMany({
      where: buildIssuedCustomerWhere(company.id, search, extraCnpjs),
      select: { recipientCnpj: true, recipientName: true },
      distinct: ['recipientCnpj'],
      take: 30,
    });

    const customers = rows
      .map((row) => ({
        cnpj: digits(row.recipientCnpj || ''),
        name: row.recipientName || row.recipientCnpj || '',
      }))
      .filter((row) => row.cnpj.length === 14);

    const cnpjs = customers.map((row) => row.cnpj);
    const cnpjKeys = [...new Set([
      ...cnpjs,
      ...rows.map((row) => row.recipientCnpj).filter((value): value is string => Boolean(value)),
    ])];
    const [overrides, fiscals] = cnpjKeys.length
      ? await Promise.all([
          prisma.contactOverride.findMany({
            where: { companyId: company.id, cnpj: { in: cnpjKeys } },
            select: { cnpj: true, street: true, district: true, city: true, state: true },
          }),
          prisma.contactFiscal.findMany({
            where: { companyId: company.id, cnpj: { in: cnpjKeys } },
            select: { cnpj: true, city: true, uf: true },
          }),
        ])
      : [[], []];

    const overrideBy = new Map(overrides.map((row) => [digits(row.cnpj), row]));
    const fiscalBy = new Map(fiscals.map((row) => [digits(row.cnpj), row]));

    return NextResponse.json({
      customers: customers.map((row) => {
        const addressLine = formatDestinatarioAddressLine(
          mergeDestinatarioAddressSources(overrideBy.get(row.cnpj), fiscalBy.get(row.cnpj)),
        );
        return addressLine ? { ...row, addressLine } : row;
      }),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/customers');
  }
}
