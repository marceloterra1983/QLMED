import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';

interface AggregatedCustomer {
  cnpj: string;
  name: string;
  city: string | null;
  invoiceCount: number;
  invoiceCountPrevYear: number;
  invoiceCountCurrentYear: number;
  totalValue: number;
  firstIssueDate: Date | null;
  lastIssueDate: Date | null;
}

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function compareStrings(left: string, right: string) {
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' });
}

function buildCustomerKey(cnpj: string | null, name: string | null) {
  if (cnpj) return cnpj;
  return `no-doc:${name || ''}`;
}

function buildYearCountMap(
  groupedInvoices: Array<{ recipientCnpj: string | null; recipientName: string | null; _count: { _all: number } }>
) {
  const yearCountMap = new Map<string, number>();
  for (const grouped of groupedInvoices) {
    const key = buildCustomerKey(grouped.recipientCnpj, grouped.recipientName);
    const current = yearCountMap.get(key) || 0;
    yearCountMap.set(key, current + (grouped._count._all || 0));
  }
  return yearCountMap;
}

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);

    const page = toPositiveInt(searchParams.get('page'), 1, 100000);
    const limit = toPositiveInt(searchParams.get('limit'), 50, 500);
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'name';
    const order = searchParams.get('order') === 'asc' ? 'asc' : 'desc';

    const where: any = {
      companyId: company.id,
      type: 'NFE',
      direction: 'issued',
    };

    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const startPrevYear = new Date(Date.UTC(prevYear, 0, 1, 0, 0, 0));
    const startCurrentYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
    const startNextYear = new Date(Date.UTC(currentYear + 1, 0, 1, 0, 0, 0));

    const [groupedInvoices, groupedPrevYear, groupedCurrentYear] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['recipientCnpj', 'recipientName'],
        where,
        _count: { _all: true },
        _sum: { totalValue: true },
        _max: { issueDate: true },
        _min: { issueDate: true },
      }),
      prisma.invoice.groupBy({
        by: ['recipientCnpj', 'recipientName'],
        where: { ...where, issueDate: { gte: startPrevYear, lt: startCurrentYear } },
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ['recipientCnpj', 'recipientName'],
        where: { ...where, issueDate: { gte: startCurrentYear, lt: startNextYear } },
        _count: { _all: true },
      }),
    ]);

    const yearCountMapPrev = buildYearCountMap(groupedPrevYear);
    const yearCountMapCurrent = buildYearCountMap(groupedCurrentYear);

    const customerMap = new Map<string, AggregatedCustomer>();

    for (const grouped of groupedInvoices) {
      const key = buildCustomerKey(grouped.recipientCnpj, grouped.recipientName);
      const invoiceCount = grouped._count._all || 0;
      const totalValue = grouped._sum.totalValue || 0;
      const firstIssueDate = grouped._min.issueDate;
      const lastIssueDate = grouped._max.issueDate;

      const existing = customerMap.get(key);
      if (!existing) {
        customerMap.set(key, {
          cnpj: grouped.recipientCnpj || '',
          name: grouped.recipientName || 'Cliente não identificado',
          city: null,
          invoiceCount,
          invoiceCountPrevYear: yearCountMapPrev.get(key) || 0,
          invoiceCountCurrentYear: yearCountMapCurrent.get(key) || 0,
          totalValue,
          firstIssueDate,
          lastIssueDate,
        });
        continue;
      }

      existing.invoiceCount += invoiceCount;
      existing.totalValue += totalValue;

      if (!existing.firstIssueDate || (firstIssueDate && firstIssueDate < existing.firstIssueDate)) {
        existing.firstIssueDate = firstIssueDate;
      }

      if (!existing.lastIssueDate || (lastIssueDate && lastIssueDate > existing.lastIssueDate)) {
        existing.lastIssueDate = lastIssueDate;
        existing.name = grouped.recipientName || existing.name;
      }
    }

    let customers = Array.from(customerMap.values());

    // Fetch city (xMun/UF) from most recent invoice per customer using DISTINCT ON
    const allCnpjs = customers.map((c) => c.cnpj).filter(Boolean);
    if (allCnpjs.length > 0) {
      const latestXmls = await prisma.$queryRaw<Array<{ recipientCnpj: string; xmlContent: string | null }>>`
        SELECT DISTINCT ON ("recipientCnpj") "recipientCnpj", "xmlContent"
        FROM "Invoice"
        WHERE "companyId" = ${company.id}
          AND "type" = 'NFE'
          AND "direction" = 'issued'
          AND "recipientCnpj" = ANY(${allCnpjs})
          AND "xmlContent" IS NOT NULL
        ORDER BY "recipientCnpj", "issueDate" DESC
      `;
      const cityByKey = new Map<string, string>();
      for (const row of latestXmls) {
        if (!row.xmlContent) continue;
        const enderDestBlock = row.xmlContent.match(/<enderDest\b[^>]*>[\s\S]*?<\/enderDest>/i)?.[0];
        const xMun = enderDestBlock?.match(/<xMun>([\s\S]*?)<\/xMun>/i)?.[1]?.trim();
        const uf = enderDestBlock?.match(/<UF>([\s\S]*?)<\/UF>/i)?.[1]?.trim();
        if (xMun) cityByKey.set(row.recipientCnpj, uf ? `${xMun} - ${uf}` : xMun);
      }
      for (const c of customers) {
        c.city = cityByKey.get(c.cnpj) || null;
      }
    }

    const allNicknames = await prisma.contactNickname.findMany({
      where: { companyId: company.id },
      select: { cnpj: true, shortName: true },
    });
    const nicknameMap = new Map(allNicknames.map((n) => [n.cnpj, n.shortName]));

    if (search) {
      const searchWords = normalizeForSearch(search).split(/\s+/).filter(Boolean);
      customers = customers.filter((c) => {
        const nick = nicknameMap.get(c.cnpj) || '';
        return flexMatchAll([c.name, c.cnpj, c.cnpj.replace(/\D/g, ''), nick], searchWords);
      });
    }

    // Precompute city count for sort=city
    const cityCountMap = new Map<string, number>();
    if (sort === 'city') {
      for (const c of customers) {
        const key = c.city || '';
        cityCountMap.set(key, (cityCountMap.get(key) || 0) + 1);
      }
    }

    customers.sort((a, b) => {
      let comparison = 0;

      switch (sort) {
        case 'cnpj':
          comparison = compareStrings(a.cnpj, b.cnpj);
          break;
        case 'documents':
          comparison = a.invoiceCount - b.invoiceCount;
          break;
        case 'documentsPrevYear':
          comparison = a.invoiceCountPrevYear - b.invoiceCountPrevYear;
          break;
        case 'documentsCurrentYear':
          comparison = a.invoiceCountCurrentYear - b.invoiceCountCurrentYear;
          break;
        case 'value':
          comparison = a.totalValue - b.totalValue;
          break;
        case 'firstIssue':
          comparison = (a.firstIssueDate?.getTime() || 0) - (b.firstIssueDate?.getTime() || 0);
          break;
        case 'lastIssue':
          comparison = (a.lastIssueDate?.getTime() || 0) - (b.lastIssueDate?.getTime() || 0);
          break;
        case 'city': {
          const countA = cityCountMap.get(a.city || '') || 0;
          const countB = cityCountMap.get(b.city || '') || 0;
          // Cities with more customers first, then alphabetical within city, then by name
          const byCityCount = countB - countA;
          if (byCityCount !== 0) return byCityCount;
          const byCityName = compareStrings(a.city || '', b.city || '');
          if (byCityName !== 0) return byCityName;
          return compareStrings(a.name, b.name);
        }
        default:
          comparison = compareStrings(a.name, b.name);
          break;
      }

      if (comparison === 0) {
        comparison = compareStrings(a.name, b.name);
      }

      return order === 'asc' ? comparison : -comparison;
    });

    const total = customers.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, pages);
    const start = (normalizedPage - 1) * limit;
    const paginatedCustomers = customers.slice(start, start + limit);

    // Compute price item count (distinct cProd::xProd::uCom) for paginated customers
    const paginatedCnpjs = paginatedCustomers.map((c) => c.cnpj).filter(Boolean);
    const priceItemCountMap = new Map<string, number>();
    if (paginatedCnpjs.length > 0) {
      const invoiceXmls = await prisma.invoice.findMany({
        where: { companyId: company.id, type: 'NFE', direction: 'issued', recipientCnpj: { in: paginatedCnpjs } },
        select: { recipientCnpj: true, xmlContent: true },
      });
      const productKeysByCnpj = new Map<string, Set<string>>();
      for (const inv of invoiceXmls) {
        if (!inv.recipientCnpj || !inv.xmlContent) continue;
        let set = productKeysByCnpj.get(inv.recipientCnpj);
        if (!set) { set = new Set(); productKeysByCnpj.set(inv.recipientCnpj, set); }
        const detBlocks = inv.xmlContent.match(/<det\b[^>]*>[\s\S]*?<\/det>/gi) || [];
        for (const det of detBlocks) {
          const code = det.match(/<cProd>([\s\S]*?)<\/cProd>/i)?.[1]?.trim() || '';
          const desc = det.match(/<xProd>([\s\S]*?)<\/xProd>/i)?.[1]?.trim() || '';
          const unit = det.match(/<uCom>([\s\S]*?)<\/uCom>/i)?.[1]?.trim() || '';
          if (code || desc) set.add(`${code}::${desc}::${unit}`);
        }
      }
      for (const [cnpj, set] of Array.from(productKeysByCnpj.entries())) {
        priceItemCountMap.set(cnpj, set.size);
      }
    }

    // nicknameMap already fetched above for search

    const summary = customers.reduce((acc, customer) => {
      acc.totalInvoices += customer.invoiceCount;
      acc.totalValue += customer.totalValue;
      return acc;
    }, { totalCustomers: total, totalInvoices: 0, totalValue: 0 });

    return NextResponse.json({
      customers: paginatedCustomers.map((c) => ({ ...c, shortName: nicknameMap.get(c.cnpj) || null, priceItemCount: priceItemCountMap.get(c.cnpj) ?? null })),
      summary,
      years: { prevYear, currentYear },
      pagination: {
        page: normalizedPage,
        limit,
        total,
        pages,
      },
    });
  } catch (error) {
    console.error('Error fetching customers:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
