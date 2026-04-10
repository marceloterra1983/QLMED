import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import { getCityByCnpjs, backfillContactFiscalCity } from '@/lib/contact-fiscal-store';

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(500).catch(50),
  search: z.string().max(200).catch(''),
  sort: z.enum(['name', 'cnpj', 'documents', 'documentsPrevYear', 'documentsCurrentYear', 'value', 'firstIssue', 'lastIssue', 'city']).catch('name'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  exportAll: z.enum(['0', '1']).catch('0'),
});

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

    const params = querySchema.parse({
      page: searchParams.get('page') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
      search: (searchParams.get('search') || '').trim(),
      sort: searchParams.get('sort') ?? undefined,
      order: searchParams.get('order') ?? undefined,
      exportAll: searchParams.get('exportAll') ?? undefined,
    });
    const { page, limit, search, sort, order } = params;
    const exportAll = params.exportAll === '1';

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
      const totalValue = Number(grouped._sum.totalValue) || 0;
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

    // Fetch city from contact_fiscal table (pre-extracted during invoice ingestion)
    const allCnpjs = customers.map((c) => c.cnpj).filter(Boolean);
    if (allCnpjs.length > 0) {
      const cityByKey = await getCityByCnpjs(company.id, allCnpjs);
      for (const c of customers) {
        c.city = cityByKey.get(c.cnpj) || null;
      }
      // Trigger lazy backfill if any customers have no city data
      const hasMissingCities = customers.some((c) => c.cnpj && !c.city);
      if (hasMissingCities) {
        backfillContactFiscalCity(company.id).catch(() => {});
      }
    }

    let nicknameMap = new Map<string, string>();
    if (search) {
      const allNicknames = await prisma.contactNickname.findMany({
        where: { companyId: company.id },
        select: { cnpj: true, shortName: true },
      });
      nicknameMap = new Map(allNicknames.map((n) => [n.cnpj, n.shortName]));
    }

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
    const paginatedCustomers = exportAll ? customers : customers.slice(start, start + limit);

    // Compute price item count (distinct product_code::product_name::product_unit) via invoice_item_tax
    const paginatedCnpjs = paginatedCustomers.map((c) => c.cnpj).filter(Boolean);
    const priceItemCountMap = new Map<string, number>();
    if (paginatedCnpjs.length > 0) {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ cnpj: string; cnt: bigint }>>(
          `SELECT i."recipientCnpj" as cnpj, COUNT(DISTINCT CONCAT(it.product_code, '::', it.product_name, '::', it.product_unit)) as cnt
           FROM invoice_item_tax it
           INNER JOIN "Invoice" i ON i.id = it.invoice_id
           WHERE it.company_id = $1
             AND i."type" = 'NFE'
             AND i."direction" = 'issued'
             AND i."recipientCnpj" = ANY($2)
           GROUP BY i."recipientCnpj"`,
          company.id,
          paginatedCnpjs,
        );
        for (const row of rows) {
          priceItemCountMap.set(row.cnpj, Number(row.cnt));
        }
      } catch {
        // invoice_item_tax table may not exist yet — fallback to 0 counts
      }
    }

    // Load nicknames only for paginated results when not searching
    if (!search && paginatedCnpjs.length > 0) {
      const pageNicknames = await prisma.contactNickname.findMany({
        where: { companyId: company.id, cnpj: { in: paginatedCnpjs } },
        select: { cnpj: true, shortName: true },
      });
      nicknameMap = new Map(pageNicknames.map((n) => [n.cnpj, n.shortName]));
    }

    const summary = customers.reduce((acc, customer) => {
      acc.totalInvoices += customer.invoiceCount;
      acc.totalValue += customer.totalValue;
      return acc;
    }, { totalCustomers: total, totalInvoices: 0, totalValue: 0 });

    // Enrich with CNPJ cache + overrides for export
    let cnpjCacheMap = new Map<string, any>();
    let overrideMap = new Map<string, any>();
    if (exportAll) {
      const exportCnpjs = paginatedCustomers.map((c) => c.cnpj).filter((c) => c && c.replace(/\D/g, '').length === 14);
      if (exportCnpjs.length > 0) {
        const digits = exportCnpjs.map((c) => c.replace(/\D/g, ''));
        try {
          const rows = await prisma.$queryRawUnsafe<any[]>(
            `SELECT cnpj, data FROM cnpj_cache WHERE cnpj = ANY($1)`,
            digits,
          );
          for (const r of rows) {
            const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
            cnpjCacheMap.set(r.cnpj, d);
          }
        } catch { /* table may not exist */ }
        const overrides = await prisma.contactOverride.findMany({
          where: { companyId: company.id, cnpj: { in: digits } },
        });
        for (const o of overrides) overrideMap.set(o.cnpj, o);
      }
    }

    return NextResponse.json({
      customers: paginatedCustomers.map((c) => {
        const base: any = { ...c, shortName: nicknameMap.get(c.cnpj) || null, priceItemCount: priceItemCountMap.get(c.cnpj) ?? null };
        if (exportAll) {
          const digits = (c.cnpj || '').replace(/\D/g, '');
          const cnpj = cnpjCacheMap.get(digits);
          const ovr = overrideMap.get(digits);
          base.receita = cnpj ? {
            razaoSocial: cnpj.razaoSocial || null,
            nomeFantasia: cnpj.nomeFantasia || null,
            situacao: cnpj.situacaoCadastral || cnpj.descSituacao || null,
            cnaePrincipal: cnpj.cnaePrincipal ? `${cnpj.cnaePrincipal.codigo} - ${cnpj.cnaePrincipal.descricao}` : null,
            porte: cnpj.porte || null,
            naturezaJuridica: cnpj.naturezaJuridica || null,
            telefone: cnpj.telefone || null,
            email: cnpj.email || null,
            endereco: cnpj.endereco || null,
            simplesNacional: cnpj.simplesNacional,
            mei: cnpj.mei,
            capitalSocial: cnpj.capitalSocial,
          } : null;
          base.override = ovr ? {
            phone: ovr.phone, email: ovr.email,
            street: ovr.street, number: ovr.number, complement: ovr.complement,
            district: ovr.district, city: ovr.city, state: ovr.state, zipCode: ovr.zipCode,
          } : null;
        }
        return base;
      }),
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
