/**
 * Shared contact listing logic for suppliers and customers.
 * Parametrized by ContactType to avoid code duplication between the two entity types.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import prisma from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { normalizeForSearch, flexMatchAll } from '@/lib/utils';
import { createLogger } from '@/lib/logger';

const log = createLogger('contact-shared');
import { getCityByCnpjs, backfillContactFiscalCity } from '@/lib/contact-fiscal-store';
import { getCfopCodesByTag } from '@/lib/cfop';

// ---------------------------------------------------------------------------
// Types & Config
// ---------------------------------------------------------------------------

export type ContactType = 'supplier' | 'customer';

const CONTACT_CONFIG = {
  supplier: {
    invoiceDirection: 'received' as const,
    cnpjField: 'senderCnpj' as const,
    nameField: 'senderName' as const,
    unknownLabel: 'Fornecedor não identificado',
    summaryKey: 'totalSuppliers' as const,
    responseKey: 'suppliers' as const,
    errorLabel: 'suppliers',
    hasCity: false,
  },
  customer: {
    invoiceDirection: 'issued' as const,
    cnpjField: 'recipientCnpj' as const,
    nameField: 'recipientName' as const,
    unknownLabel: 'Cliente não identificado',
    summaryKey: 'totalCustomers' as const,
    responseKey: 'customers' as const,
    errorLabel: 'customers',
    hasCity: true,
  },
} as const;

// ---------------------------------------------------------------------------
// Schema (union of both — 'city' sort only applies to customers)
// ---------------------------------------------------------------------------

const querySchema = z.object({
  page: z.coerce.number().int().positive().max(10000).catch(1),
  limit: z.coerce.number().int().positive().max(500).catch(50),
  search: z.string().max(200).catch(''),
  sort: z.enum(['name', 'cnpj', 'documents', 'documentsPrevYear', 'documentsCurrentYear', 'value', 'firstIssue', 'lastIssue', 'city']).catch('name'),
  order: z.enum(['asc', 'desc']).catch('desc'),
  exportAll: z.enum(['0', '1']).catch('0'),
});

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface AggregatedContact {
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

function buildContactKey(cnpj: string | null, name: string | null) {
  if (cnpj) return cnpj;
  return `no-doc:${name || ''}`;
}

function buildYearCountMap(
  groupedInvoices: Array<Record<string, unknown> & { _count: { _all: number } }>,
  cnpjField: string,
  nameField: string,
) {
  const yearCountMap = new Map<string, number>();
  for (const grouped of groupedInvoices) {
    const key = buildContactKey(grouped[cnpjField] as string | null, grouped[nameField] as string | null);
    const current = yearCountMap.get(key) || 0;
    yearCountMap.set(key, current + (grouped._count._all || 0));
  }
  return yearCountMap;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleContactList(
  company: { id: string },
  contactType: ContactType,
  searchParams: URLSearchParams,
) {
  const cfg = CONTACT_CONFIG[contactType];
  const { cnpjField, nameField } = cfg;

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

  const where: Prisma.InvoiceWhereInput = {
    companyId: company.id,
    type: 'NFE',
    direction: cfg.invoiceDirection,
  };

  const currentYear = new Date().getFullYear();
  const prevYear = currentYear - 1;
  const startPrevYear = new Date(Date.UTC(prevYear, 0, 1, 0, 0, 0));
  const startCurrentYear = new Date(Date.UTC(currentYear, 0, 1, 0, 0, 0));
  const startNextYear = new Date(Date.UTC(currentYear + 1, 0, 1, 0, 0, 0));

  const isCustomer = contactType === 'customer';
  const saleCfopCodes = isCustomer ? getCfopCodesByTag('Venda') : [];

  const [groupedInvoices, groupedPrevYear, groupedCurrentYear, groupedSales] = await Promise.all([
    prisma.invoice.groupBy({
      by: [cnpjField, nameField],
      where,
      _count: { _all: true },
      _sum: { totalValue: true },
      _max: { issueDate: true },
      _min: { issueDate: true },
    }),
    prisma.invoice.groupBy({
      by: [cnpjField, nameField],
      where: { ...where, issueDate: { gte: startPrevYear, lt: startCurrentYear } },
      _count: { _all: true },
    }),
    prisma.invoice.groupBy({
      by: [cnpjField, nameField],
      where: { ...where, issueDate: { gte: startCurrentYear, lt: startNextYear } },
      _count: { _all: true },
    }),
    isCustomer && saleCfopCodes.length > 0
      ? prisma.invoice.groupBy({
          by: [cnpjField, nameField],
          where: { ...where, cfop: { in: saleCfopCodes } },
          _sum: { totalValue: true },
        })
      : Promise.resolve([]),
  ]);

  const yearCountMapPrev = buildYearCountMap(groupedPrevYear, cnpjField, nameField);
  const yearCountMapCurrent = buildYearCountMap(groupedCurrentYear, cnpjField, nameField);

  const salesMap = new Map<string, number>();
  if (isCustomer) {
    for (const s of groupedSales as Array<{
      [key: string]: unknown;
      _sum: { totalValue: unknown };
    }>) {
      const key = buildContactKey(s[cnpjField] as string | null, s[nameField] as string | null);
      const val = Number(s._sum?.totalValue) || 0;
      salesMap.set(key, (salesMap.get(key) || 0) + val);
    }
  }

  const contactMap = new Map<string, AggregatedContact>();

  for (const grouped of groupedInvoices) {
    const key = buildContactKey(grouped[cnpjField] as string | null, grouped[nameField] as string | null);
    const invoiceCount = grouped._count._all || 0;
    const totalValue = isCustomer
      ? (salesMap.get(key) || 0)
      : (Number(grouped._sum.totalValue) || 0);
    const firstIssueDate = grouped._min.issueDate;
    const lastIssueDate = grouped._max.issueDate;

    const existing = contactMap.get(key);
    if (!existing) {
      contactMap.set(key, {
        cnpj: (grouped[cnpjField] as string) || '',
        name: (grouped[nameField] as string) || cfg.unknownLabel,
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
    if (!isCustomer) {
      existing.totalValue += totalValue;
    }

    if (!existing.firstIssueDate || (firstIssueDate && firstIssueDate < existing.firstIssueDate)) {
      existing.firstIssueDate = firstIssueDate;
    }

    if (!existing.lastIssueDate || (lastIssueDate && lastIssueDate > existing.lastIssueDate)) {
      existing.lastIssueDate = lastIssueDate;
      existing.name = (grouped[nameField] as string) || existing.name;
    }
  }

  let contacts = Array.from(contactMap.values());

  // City lookup (customers only — uses contact_fiscal table)
  if (cfg.hasCity) {
    const allCnpjs = contacts.map((c) => c.cnpj).filter(Boolean);
    if (allCnpjs.length > 0) {
      const cityByKey = await getCityByCnpjs(company.id, allCnpjs);
      for (const c of contacts) {
        c.city = cityByKey.get(c.cnpj) || null;
      }
      const hasMissingCities = contacts.some((c) => c.cnpj && !c.city);
      if (hasMissingCities) {
        backfillContactFiscalCity(company.id).catch(() => {});
      }
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
    contacts = contacts.filter((c) => {
      const nick = nicknameMap.get(c.cnpj) || '';
      return flexMatchAll([c.name, c.cnpj, c.cnpj.replace(/\D/g, ''), nick], searchWords);
    });
  }

  // Precompute city count for sort=city (customers only)
  const cityCountMap = new Map<string, number>();
  if (sort === 'city' && cfg.hasCity) {
    for (const c of contacts) {
      const k = c.city || '';
      cityCountMap.set(k, (cityCountMap.get(k) || 0) + 1);
    }
  }

  contacts.sort((a, b) => {
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
        if (!cfg.hasCity) break;
        const countA = cityCountMap.get(a.city || '') || 0;
        const countB = cityCountMap.get(b.city || '') || 0;
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

  const total = contacts.length;
  const pages = Math.max(1, Math.ceil(total / limit));
  const normalizedPage = Math.min(page, pages);
  const start = (normalizedPage - 1) * limit;
  const paginatedContacts = exportAll ? contacts : contacts.slice(start, start + limit);

  // Compute price item count (distinct product_code::product_name::product_unit) via invoice_item_tax
  const paginatedCnpjs = paginatedContacts.map((c) => c.cnpj).filter(Boolean);
  const priceItemCountMap = new Map<string, number>();
  if (paginatedCnpjs.length > 0) {
    try {
      const invoices = await prisma.invoice.findMany({
        where: {
          companyId: company.id,
          type: 'NFE',
          direction: cfg.invoiceDirection as 'received' | 'issued',
          ...(contactType === 'supplier'
            ? { senderCnpj: { in: paginatedCnpjs } }
            : { recipientCnpj: { in: paginatedCnpjs } }),
        },
        select: {
          id: true,
          senderCnpj: true,
          recipientCnpj: true,
        },
      });
      const invById = new Map(invoices.map((i) => [i.id, i]));
      const invIds = invoices.map((i) => i.id);
      if (invIds.length > 0) {
        const items = await prisma.invoiceItemTax.findMany({
          where: { companyId: company.id, invoiceId: { in: invIds } },
          select: {
            invoiceId: true,
            productCode: true,
            productDescription: true,
          },
        });
        const distinctByCnpj = new Map<string, Set<string>>();
        for (const it of items) {
          const inv = invById.get(it.invoiceId);
          if (!inv) continue;
          const cnpj =
            contactType === 'supplier' ? inv.senderCnpj : inv.recipientCnpj;
          if (!cnpj) continue;
          let set = distinctByCnpj.get(cnpj);
          if (!set) {
            set = new Set();
            distinctByCnpj.set(cnpj, set);
          }
          set.add(`${it.productCode || ''}::${it.productDescription || ''}`);
        }
        for (const [cnpj, set] of distinctByCnpj) {
          priceItemCountMap.set(cnpj, set.size);
        }
      }
    } catch (err) {
      log.warn({ err }, 'invoice_item_tax price count query failed — fallback to 0 counts');
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

  const summary = contacts.reduce((acc, contact) => {
    acc.totalInvoices += contact.invoiceCount;
    acc.totalValue += contact.totalValue;
    return acc;
  }, { [cfg.summaryKey]: total, totalInvoices: 0, totalValue: 0 } as Record<string, number>);

  // Enrich with CNPJ cache + overrides for export
  interface CnpjCacheData {
    razaoSocial?: string;
    nomeFantasia?: string;
    situacaoCadastral?: string;
    descSituacao?: string;
    cnaePrincipal?: { codigo?: string; descricao?: string } | null;
    porte?: string;
    naturezaJuridica?: string;
    telefone?: string;
    email?: string;
    endereco?: string;
    simplesNacional?: boolean | null;
    mei?: boolean | null;
    capitalSocial?: number | null;
  }
  interface ContactOverrideData {
    phone?: string | null;
    email?: string | null;
    street?: string | null;
    number?: string | null;
    complement?: string | null;
    district?: string | null;
    city?: string | null;
    state?: string | null;
    zipCode?: string | null;
  }
  let cnpjCacheMap = new Map<string, CnpjCacheData>();
  let overrideMap = new Map<string, ContactOverrideData>();
  if (exportAll) {
    const exportCnpjs = paginatedContacts.map((c) => c.cnpj).filter((c) => c && c.replace(/\D/g, '').length === 14);
    if (exportCnpjs.length > 0) {
      const digits = exportCnpjs.map((c) => c.replace(/\D/g, ''));
      const rows = await prisma.cnpjCache.findMany({
        where: { cnpj: { in: digits } },
        select: { cnpj: true, data: true },
      });
      for (const r of rows) {
        const d = typeof r.data === 'string' ? JSON.parse(r.data) : r.data;
        cnpjCacheMap.set(r.cnpj, d as CnpjCacheData);
      }
      const overrides = await prisma.contactOverride.findMany({
        where: { companyId: company.id, cnpj: { in: digits } },
      });
      for (const o of overrides) overrideMap.set(o.cnpj, o);
    }
  }

  return NextResponse.json({
    [cfg.responseKey]: paginatedContacts.map((c) => {
      const base: Record<string, unknown> = { ...c, shortName: nicknameMap.get(c.cnpj) || null, priceItemCount: priceItemCountMap.get(c.cnpj) ?? null };
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
}
