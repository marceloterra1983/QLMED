import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { normalizeForSearch } from '@/lib/utils';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';
import { cacheHeaders } from '@/lib/cache-headers';

const log = createLogger('products/list');

const SORT_COLUMN_MAP: Record<string, string> = {
  description: 'pr.description',
  code: 'pr.code',
  ncm: 'pr.ncm',
  anvisa: 'pr.anvisa_code',
  lastPrice: 'pr.agg_last_price',
  lastIssueDate: 'pr.agg_last_issue_date',
  lastSaleDate: 'pr.agg_last_sale_date',
  supplier: 'pr.agg_last_supplier_name',
  productType: 'pr.product_type',
  quantity: 'pr.agg_total_quantity',
  totalQuantity: 'pr.agg_total_quantity',
  invoices: 'pr.agg_invoice_count',
  invoiceCount: 'pr.agg_invoice_count',
  averagePrice: 'pr.agg_average_price',
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
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(10, parseInt(searchParams.get('limit') || '50', 10)));
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'lastIssueDate';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const lineStatus = searchParams.get('lineStatus') || 'active';
    const productType = searchParams.get('productType') || '';
    const productSubtype = searchParams.get('productSubtype') || '';
    const productSubgroup = searchParams.get('productSubgroup') || '';
    const onlyMissingAnvisa = searchParams.get('onlyMissingAnvisa') === '1';

    // Check if any aggregated data exists
    const aggCheck = await prisma.$queryRawUnsafe<{ cnt: number }[]>(
      `SELECT COUNT(*)::int as cnt FROM product_registry WHERE company_id = $1 AND agg_computed_at IS NOT NULL LIMIT 1`,
      company.id,
    );
    const hasAggregates = (aggCheck[0]?.cnt || 0) > 0;

    // Build WHERE clauses
    const conditions: string[] = ['pr.company_id = $1'];
    if (hasAggregates) {
      conditions.push('pr.agg_computed_at IS NOT NULL');
    }
    const params: (string | number)[] = [company.id];
    let paramIdx = 2;

    // Line status filter
    if (lineStatus === 'active') {
      conditions.push('(pr.out_of_line IS NULL OR pr.out_of_line = false)');
    } else if (lineStatus === 'outOfLine') {
      conditions.push('pr.out_of_line = true');
    }

    if (productType) {
      conditions.push(`pr.product_type = $${paramIdx}`);
      params.push(productType);
      paramIdx++;
    }

    if (productSubtype) {
      conditions.push(`pr.product_subtype = $${paramIdx}`);
      params.push(productSubtype);
      paramIdx++;
    }

    if (productSubgroup) {
      conditions.push(`pr.product_subgroup = $${paramIdx}`);
      params.push(productSubgroup);
      paramIdx++;
    }

    if (onlyMissingAnvisa) {
      conditions.push(`(pr.anvisa_code IS NULL OR pr.anvisa_code = '')`);
    }

    // Search
    if (search) {
      const normalizedSearch = normalizeForSearch(search);
      if (hasAggregates) {
        conditions.push(`pr.agg_search_text LIKE $${paramIdx}`);
      } else {
        conditions.push(`(LOWER(pr.description) LIKE $${paramIdx} OR LOWER(COALESCE(pr.code,'')) LIKE $${paramIdx})`);
      }
      params.push(`%${normalizedSearch}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Sort
    const sortColumn = hasAggregates
      ? (SORT_COLUMN_MAP[sort] || 'pr.agg_last_issue_date')
      : (sort === 'description' || sort === 'code' || sort === 'ncm' || sort === 'anvisa'
          ? (SORT_COLUMN_MAP[sort] || 'pr.description')
          : 'pr.description');
    const nullsClause = order === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
    let orderClause = `${sortColumn} ${order} ${nullsClause}`;

    if (sort === 'productType') {
      orderClause = `pr.product_type ${order} ${nullsClause}, pr.product_subtype ${order} ${nullsClause}, pr.product_subgroup ${order} ${nullsClause}, pr.agg_last_supplier_name ASC NULLS LAST`;
    }

    orderClause += ', pr.description ASC';

    // COUNT query for pagination (same WHERE clause, no LIMIT)
    const countResult = await prisma.$queryRawUnsafe<{ total: number }[]>(
      `SELECT COUNT(*)::int as total FROM product_registry pr WHERE ${whereClause}`,
      ...params,
    );
    const total = countResult[0]?.total || 0;

    // Add LIMIT/OFFSET params for main query
    const offset = (page - 1) * limit;
    const limitParamIdx = paramIdx;
    const offsetParamIdx = paramIdx + 1;
    const paginationParams = [...params, limit, offset];

    // Fetch products — lightweight columns only (no ANVISA details, no fiscal)
    interface ProductRegistryRow {
      product_key: string; codigo: string | null; code: string; description: string;
      ncm: string | null; unit: string; short_name: string | null; manufacturer_short_name: string | null;
      anvisa_code: string | null; anvisa_manufacturer: string | null;
      product_type: string | null; product_subtype: string | null; product_subgroup: string | null;
      out_of_line: boolean | string | null;
      agg_last_price: number | null; agg_average_price: number | null;
      agg_last_issue_date: string | null; agg_last_supplier_name: string | null;
      agg_invoice_count: number | null; agg_total_quantity: number | null;
    }
    const rows = await prisma.$queryRawUnsafe<ProductRegistryRow[]>(
      `
      SELECT
        pr.product_key,
        pr.codigo,
        pr.code,
        pr.description,
        pr.ncm,
        pr.unit,
        pr.short_name,
        pr.manufacturer_short_name,
        pr.anvisa_code,
        pr.anvisa_manufacturer,
        pr.product_type,
        pr.product_subtype,
        pr.product_subgroup,
        pr.out_of_line,
        pr.agg_last_price,
        pr.agg_average_price,
        pr.agg_last_issue_date,
        pr.agg_last_supplier_name,
        pr.agg_invoice_count,
        pr.agg_total_quantity
      FROM product_registry pr
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT $${limitParamIdx} OFFSET $${offsetParamIdx}
      `,
      ...paginationParams,
    );

    // Map to lightweight ProductRow — enough for table display
    const products = rows.map((row) => ({
      key: row.product_key,
      codigo: row.codigo || null,
      code: row.code || '-',
      description: row.description || '',
      ncm: row.ncm || null,
      unit: row.unit || '-',
      shortName: row.short_name || null,
      manufacturerShortName: row.manufacturer_short_name || null,
      anvisa: row.anvisa_code || null,
      anvisaManufacturer: row.anvisa_manufacturer || null,
      productType: row.product_type || null,
      productSubtype: row.product_subtype || null,
      productSubgroup: row.product_subgroup || null,
      outOfLine: row.out_of_line === true || row.out_of_line === 't',
      lastPrice: Number(row.agg_last_price || 0),
      averagePrice: Number(row.agg_average_price || 0),
      lastIssueDate: row.agg_last_issue_date || null,
      lastSupplierName: row.agg_last_supplier_name || null,
      invoiceCount: Number(row.agg_invoice_count || 0),
      totalQuantity: Number(row.agg_total_quantity || 0),
    }));

    // Summary counts (full filtered set, no LIMIT — aggregate stats)
    const summaryResult = await prisma.$queryRawUnsafe<{ total_products: bigint; with_anvisa: bigint; total_quantity: number }[]>(
      `
      SELECT
        COUNT(*) as total_products,
        COUNT(*) FILTER (WHERE pr.anvisa_code IS NOT NULL AND pr.anvisa_code != '') as with_anvisa,
        COALESCE(SUM(pr.agg_total_quantity), 0) as total_quantity
      FROM product_registry pr
      WHERE ${whereClause}
      `,
      ...params,
    );

    const summaryRow = summaryResult[0] || {};
    const summary = {
      totalProducts: Number(summaryRow.total_products || 0),
      productsWithAnvisa: Number(summaryRow.with_anvisa || 0),
      totalQuantity: Number(summaryRow.total_quantity || 0),
      invoicesProcessed: 0,
    };

    return NextResponse.json({
      products,
      summary,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      needsRebuild: !hasAggregates,
    }, { headers: cacheHeaders('list') });
  } catch (error) {
    return apiError(error, 'products/list');
  }
}
