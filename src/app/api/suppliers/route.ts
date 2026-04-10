import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(100).catch(50),
  search: z.string().max(200).catch(''),
  sort: z.enum(['name', 'cnpj', 'documents', 'documentsPrevYear', 'documentsCurrentYear', 'value', 'firstIssue', 'lastIssue']).catch('name'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  exportAll: z.enum(['0', '1']).catch('0'),
});

interface AggregatedSupplier {
  cnpj: string;
  name: string;
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

function buildSupplierKey(cnpj: string | null, name: string | null) {
  if (cnpj) return cnpj;
  return `no-doc:${name || ''}`;
}

function buildYearCountMap(
  groupedInvoices: Array<{ senderCnpj: string | null; senderName: string | null; _count: { _all: number } }>
) {
  const yearCountMap = new Map<string, number>();
  for (const grouped of groupedInvoices) {
    const key = buildSupplierKey(grouped.senderCnpj, grouped.senderName);
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
      direction: 'received',
    };

    const currentYear = new Date().getFullYear();
    const prevYear = currentYear - 1;
    const startPrevYear = new Date(Date.UTC(prevYear, 0, 1, 0, 0, 0));
    const startCurrentYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
    const startNextYear = new Date(Date.UTC(currentYear + 1, 0, 1, 0, 0, 0));

    const [groupedInvoices, groupedPrevYear, groupedCurrentYear] = await Promise.all([
      prisma.invoice.groupBy({
        by: ['senderCnpj', 'senderName'],
        where,
        _count: { _all: true },
        _sum: { totalValue: true },
        _max: { issueDate: true },
        _min: { issueDate: true },
      }),
      prisma.invoice.groupBy({
        by: ['senderCnpj', 'senderName'],
        where: { ...where, issueDate: { gte: startPrevYear, lt: startCurrentYear } },
        _count: { _all: true },
      }),
      prisma.invoice.groupBy({
        by: ['senderCnpj', 'senderName'],
        where: { ...where, issueDate: { gte: startCurrentYear, lt: startNextYear } },
        _count: { _all: true },
      }),
    ]);

    const yearCountMapPrev = buildYearCountMap(groupedPrevYear);
    const yearCountMapCurrent = buildYearCountMap(groupedCurrentYear);

    const supplierMap = new Map<string, AggregatedSupplier>();

    for (const grouped of groupedInvoices) {
      const key = buildSupplierKey(grouped.senderCnpj, grouped.senderName);
      const invoiceCount = grouped._count._all || 0;
      const totalValue = Number(grouped._sum.totalValue) || 0;
      const firstIssueDate = grouped._min.issueDate;
      const lastIssueDate = grouped._max.issueDate;

      const existing = supplierMap.get(key);
      if (!existing) {
        supplierMap.set(key, {
          cnpj: grouped.senderCnpj || '',
          name: grouped.senderName || 'Fornecedor não identificado',
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
        existing.name = grouped.senderName || existing.name;
      }
    }

    let suppliers = Array.from(supplierMap.values());

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
      suppliers = suppliers.filter((s) => {
        const nick = nicknameMap.get(s.cnpj) || '';
        return flexMatchAll([s.name, s.cnpj, s.cnpj.replace(/\D/g, ''), nick], searchWords);
      });
    }

    suppliers.sort((a, b) => {
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
        default:
          comparison = compareStrings(a.name, b.name);
          break;
      }

      if (comparison === 0) {
        comparison = compareStrings(a.name, b.name);
      }

      return order === 'asc' ? comparison : -comparison;
    });

    const total = suppliers.length;
    const pages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, pages);
    const start = (normalizedPage - 1) * limit;
    const paginatedSuppliers = exportAll ? suppliers : suppliers.slice(start, start + limit);

    // Compute price item count (distinct product_code::product_name::product_unit) via invoice_item_tax
    const paginatedCnpjs = paginatedSuppliers.map((s) => s.cnpj).filter(Boolean);
    const priceItemCountMap = new Map<string, number>();
    if (paginatedCnpjs.length > 0) {
      try {
        const rows = await prisma.$queryRawUnsafe<Array<{ cnpj: string; cnt: bigint }>>(
          `SELECT i."senderCnpj" as cnpj, COUNT(DISTINCT CONCAT(it.product_code, '::', it.product_name, '::', it.product_unit)) as cnt
           FROM invoice_item_tax it
           INNER JOIN "Invoice" i ON i.id = it.invoice_id
           WHERE it.company_id = $1
             AND i."type" = 'NFE'
             AND i."direction" = 'received'
             AND i."senderCnpj" = ANY($2)
           GROUP BY i."senderCnpj"`,
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

    const summary = suppliers.reduce((acc, supplier) => {
      acc.totalInvoices += supplier.invoiceCount;
      acc.totalValue += supplier.totalValue;
      return acc;
    }, { totalSuppliers: total, totalInvoices: 0, totalValue: 0 });

    // Enrich with CNPJ cache + overrides for export
    let cnpjCacheMap = new Map<string, any>();
    let overrideMap = new Map<string, any>();
    if (exportAll) {
      const exportCnpjs = paginatedSuppliers.map((s) => s.cnpj).filter((c) => c && c.replace(/\D/g, '').length === 14);
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
      suppliers: paginatedSuppliers.map((s) => {
        const base: any = { ...s, shortName: nicknameMap.get(s.cnpj) || null, priceItemCount: priceItemCountMap.get(s.cnpj) ?? null };
        if (exportAll) {
          const digits = (s.cnpj || '').replace(/\D/g, '');
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
    console.error('Error fetching suppliers:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
