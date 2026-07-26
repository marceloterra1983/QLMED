import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { normalizeForSearch } from '@/lib/utils';
import { apiError, apiValidationError } from '@/lib/api-error';
import { cacheHeaders } from '@/lib/cache-headers';
import { productsListQuerySchema } from '@/lib/schemas/product';

const EXPORT_ALL_LIMIT = 10000;

const SORT_FIELD_MAP: Record<string, Prisma.ProductRegistryOrderByWithRelationInput> = {
  description: { description: 'asc' },
  code: { code: 'asc' },
  ncm: { ncm: 'asc' },
  anvisa: { anvisaCode: 'asc' },
  lastPrice: { aggLastPrice: 'asc' },
  lastIssueDate: { aggLastIssueDate: 'asc' },
  lastSaleDate: { aggLastSaleDate: 'asc' },
  supplier: { aggLastSupplierName: 'asc' },
  productType: { productType: 'asc' },
  quantity: { aggTotalQuantity: 'asc' },
  totalQuantity: { aggTotalQuantity: 'asc' },
  invoices: { aggInvoiceCount: 'asc' },
  invoiceCount: { aggInvoiceCount: 'asc' },
  averagePrice: { aggAveragePrice: 'asc' },
};

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    await ensureProductRegistryTable();

    const { searchParams } = new URL(req.url);
    const parsedQuery = productsListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsedQuery.success) return apiValidationError(parsedQuery.error);

    const {
      page,
      limit,
      search,
      sort,
      lineStatus,
      productType,
      productSubtype,
      productSubgroup,
      onlyMissingAnvisa,
      exportAll,
    } = parsedQuery.data;
    const orderDir = parsedQuery.data.order === 'asc' ? 'asc' : 'desc';

    const hasAggregates = !!(await prisma.productRegistry.findFirst({
      where: { companyId: company.id, aggComputedAt: { not: null } },
      select: { id: true },
    }));

    const where: Prisma.ProductRegistryWhereInput = {
      companyId: company.id,
    };

    if (hasAggregates) {
      where.aggComputedAt = { not: null };
    }

    if (lineStatus === 'active') {
      where.OR = [{ outOfLine: null }, { outOfLine: false }];
    } else if (lineStatus === 'outOfLine') {
      where.outOfLine = true;
    }

    if (productType) where.productType = productType;
    if (productSubtype) where.productSubtype = productSubtype;
    if (productSubgroup) where.productSubgroup = productSubgroup;

    if (onlyMissingAnvisa) {
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        { OR: [{ anvisaCode: null }, { anvisaCode: '' }] },
      ];
    }

    if (search) {
      const normalizedSearch = normalizeForSearch(search);
      const searchFilter: Prisma.ProductRegistryWhereInput = hasAggregates
        ? { aggSearchText: { contains: normalizedSearch } }
        : {
            OR: [
              { description: { contains: normalizedSearch, mode: 'insensitive' } },
              { code: { contains: normalizedSearch, mode: 'insensitive' } },
            ],
          };
      where.AND = [
        ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
        searchFilter,
      ];
    }

    const total = await prisma.productRegistry.count({ where });

    const effectiveLimit = exportAll ? EXPORT_ALL_LIMIT : limit;
    const pages = exportAll ? 1 : Math.max(1, Math.ceil(total / limit));
    const normalizedPage = exportAll ? 1 : Math.min(page, pages);
    const offset = exportAll ? 0 : (normalizedPage - 1) * limit;

    let orderBy: Prisma.ProductRegistryOrderByWithRelationInput[] = [];
    if (sort === 'productType') {
      orderBy = [
        { productType: orderDir },
        { productSubtype: orderDir },
        { productSubgroup: orderDir },
        { aggLastSupplierName: 'asc' },
        { description: 'asc' },
      ];
    } else {
      const base = SORT_FIELD_MAP[sort];
      if (base && hasAggregates) {
        const key = Object.keys(base)[0] as keyof Prisma.ProductRegistryOrderByWithRelationInput;
        orderBy = [{ [key]: orderDir } as Prisma.ProductRegistryOrderByWithRelationInput, { description: 'asc' }];
      } else if (sort === 'description' || sort === 'code' || sort === 'ncm' || sort === 'anvisa') {
        const key =
          sort === 'anvisa'
            ? 'anvisaCode'
            : (sort as 'description' | 'code' | 'ncm');
        orderBy = [{ [key]: orderDir } as Prisma.ProductRegistryOrderByWithRelationInput, { description: 'asc' }];
      } else if (hasAggregates) {
        orderBy = [{ aggLastIssueDate: orderDir }, { description: 'asc' }];
      } else {
        orderBy = [{ description: orderDir }];
      }
    }

    const rows = await prisma.productRegistry.findMany({
      where,
      orderBy,
      take: effectiveLimit,
      skip: offset,
    });

    const products = rows.map((row) => ({
      key: row.productKey,
      codigo: row.codigo || null,
      code: row.code || '-',
      description: row.description || '',
      ncm: row.ncm || null,
      unit: row.unit || '-',
      ean: row.ean || null,
      shortName: row.shortName || null,
      manufacturerShortName: row.manufacturerShortName || null,
      anvisa: row.anvisaCode || null,
      anvisaMatchMethod: row.anvisaSource || null,
      anvisaConfidence: row.anvisaConfidence != null ? Number(row.anvisaConfidence) : null,
      anvisaMatchedProductName: row.anvisaMatchedProductName || null,
      anvisaHolder: row.anvisaHolder || null,
      anvisaProcess: row.anvisaProcess || null,
      anvisaStatus: row.anvisaStatus || null,
      anvisaExpiration: row.anvisaExpiration || null,
      anvisaRiskClass: row.anvisaRiskClass || null,
      anvisaManufacturer: row.anvisaManufacturer || null,
      anvisaManufacturerCountry: row.anvisaManufacturerCountry || null,
      productType: row.productType || null,
      productSubtype: row.productSubtype || null,
      productSubgroup: row.productSubgroup || null,
      outOfLine: row.outOfLine === true,
      instrumental: row.instrumental === true,
      fiscalSitTributaria: row.fiscalSitTributaria || null,
      fiscalNomeTributacao: row.fiscalNomeTributacao || null,
      fiscalIcms: row.fiscalIcms != null ? Number(row.fiscalIcms) : null,
      fiscalPis: row.fiscalPis != null ? Number(row.fiscalPis) : null,
      fiscalCofins: row.fiscalCofins != null ? Number(row.fiscalCofins) : null,
      fiscalObs: row.fiscalObs || null,
      fiscalCest: row.fiscalCest || null,
      fiscalOrigem: row.fiscalOrigem || null,
      fiscalCfopEntrada: row.fiscalCfopEntrada || null,
      fiscalCfopSaida: row.fiscalCfopSaida || null,
      fiscalIpi: row.fiscalIpi != null ? Number(row.fiscalIpi) : null,
      fiscalFcp: row.fiscalFcp != null ? Number(row.fiscalFcp) : null,
      fiscalCstIpi: row.fiscalCstIpi || null,
      fiscalCstPis: row.fiscalCstPis || null,
      fiscalCstCofins: row.fiscalCstCofins || null,
      fiscalObsIcms: row.fiscalObsIcms || null,
      fiscalObsPisCofins: row.fiscalObsPisCofins || null,
      lastPrice: Number(row.aggLastPrice || 0),
      averagePrice: Number(row.aggAveragePrice || 0),
      lastIssueDate: row.aggLastIssueDate || null,
      lastSaleDate: row.aggLastSaleDate || null,
      lastSalePrice: row.aggLastSalePrice != null ? Number(row.aggLastSalePrice) : null,
      lastSupplierName: row.aggLastSupplierName || null,
      invoiceCount: Number(row.aggInvoiceCount || 0),
      totalQuantity: Number(row.aggTotalQuantity || 0),
    }));

    const [withAnvisa, qtyAgg] = await Promise.all([
      prisma.productRegistry.count({
        where: {
          AND: [
            where,
            { anvisaCode: { not: null } },
            { NOT: { anvisaCode: '' } },
          ],
        },
      }),
      prisma.productRegistry.aggregate({
        where,
        _sum: { aggTotalQuantity: true },
      }),
    ]);

    const summary = {
      totalProducts: total,
      productsWithAnvisa: withAnvisa,
      totalQuantity: Number(qtyAgg._sum.aggTotalQuantity || 0),
      invoicesProcessed: 0,
    };

    return NextResponse.json(
      {
        products,
        summary,
        pagination: {
          page: normalizedPage,
          limit: effectiveLimit,
          total,
          pages,
        },
        exportLimited: exportAll && total > EXPORT_ALL_LIMIT,
        needsRebuild: !hasAggregates,
      },
      { headers: cacheHeaders('list') },
    );
  } catch (error) {
    return apiError(error, 'products/list');
  }
}
