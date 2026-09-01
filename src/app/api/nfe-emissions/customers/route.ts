import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import {
  buildIssuedCustomerWhere,
  buildTopBilledWhere,
  destinatarioBillingWindowStart,
  formatDestinatarioAddressLine,
  isCnpjLikeSearch,
  mergeDestinatarioAddressSources,
  orderDestinatariosForDropdown,
  rankRecipientsByBilling,
} from '@/lib/nfe-emission/customer-search';
import { applyRecipientShortNames } from '@/lib/nfe-emission/recipient-display-name';

function digits(value: string): string {
  return value.replace(/\D/g, '');
}

async function attachAddressLines<T extends { cnpj: string }>(
  companyId: string,
  customers: T[],
  extraRawCnpjs: string[] = [],
): Promise<Array<T & { addressLine?: string }>> {
  const cnpjKeys = [...new Set([
    ...customers.map((row) => row.cnpj),
    ...extraRawCnpjs,
  ])];
  if (cnpjKeys.length === 0) return customers;

  const [overrides, fiscals] = await Promise.all([
    prisma.contactOverride.findMany({
      where: { companyId, cnpj: { in: cnpjKeys } },
      select: { cnpj: true, street: true, district: true, city: true, state: true },
    }),
    prisma.contactFiscal.findMany({
      where: { companyId, cnpj: { in: cnpjKeys } },
      select: { cnpj: true, city: true, uf: true },
    }),
  ]);

  const overrideBy = new Map(overrides.map((row) => [digits(row.cnpj), row]));
  const fiscalBy = new Map(fiscals.map((row) => [digits(row.cnpj), row]));

  return customers.map((row) => {
    const addressLine = formatDestinatarioAddressLine(
      mergeDestinatarioAddressSources(overrideBy.get(row.cnpj), fiscalBy.get(row.cnpj)),
    );
    return addressLine ? { ...row, addressLine } : row;
  });
}

async function loadCompanyNicknames(companyId: string) {
  return prisma.contactNickname.findMany({
    where: { companyId },
    select: { cnpj: true, shortName: true },
  });
}

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const search = new URL(req.url).searchParams.get('search') || '';
    const term = search.trim();
    const searchActive = Boolean(term);

    // Sem busca: só top 10 faturados (6 meses). Não carrega o catálogo A–Z.
    if (!searchActive) {
      const since = destinatarioBillingWindowStart();
      const billingRows = await prisma.invoice.findMany({
        where: buildTopBilledWhere(company.id, since),
        select: { recipientCnpj: true, recipientName: true, totalValue: true },
      });
      const topBilled = rankRecipientsByBilling(
        billingRows.map((row) => ({
          recipientCnpj: row.recipientCnpj,
          recipientName: row.recipientName,
          totalValue: Number(row.totalValue),
        })),
      );
      const withNick = applyRecipientShortNames(
        topBilled.map((row) => ({ cnpj: row.cnpj, name: row.name })),
        await loadCompanyNicknames(company.id),
      );
      const ordered = orderDestinatariosForDropdown(withNick, topBilled, false);
      const customers = await attachAddressLines(company.id, ordered);
      return NextResponse.json({ customers });
    }

    let extraCnpjs: string[] = [];
    if (!isCnpjLikeSearch(term)) {
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

    const baseCustomers = rows
      .map((row) => ({
        cnpj: digits(row.recipientCnpj || ''),
        name: row.recipientName || row.recipientCnpj || '',
      }))
      .filter((row) => row.cnpj.length === 14);

    const withNick = applyRecipientShortNames(
      baseCustomers,
      await loadCompanyNicknames(company.id),
    );
    const ordered = orderDestinatariosForDropdown(withNick, [], true);
    const customers = await attachAddressLines(
      company.id,
      ordered,
      rows.map((row) => row.recipientCnpj).filter((value): value is string => Boolean(value)),
    );

    return NextResponse.json({ customers });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/customers');
  }
}
