import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { normalizeForSearch } from '@/lib/utils';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

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
    const page = toPositiveInt(searchParams.get('page'), 1, 100000);
    const limit = toPositiveInt(searchParams.get('limit'), DEFAULT_LIMIT, MAX_LIMIT);
    const search = (searchParams.get('search') || '').trim();
    const sort = searchParams.get('sort') || 'lastIssueDate';
    const order = searchParams.get('order') === 'asc' ? 'ASC' : 'DESC';
    const lineStatus = searchParams.get('lineStatus') || 'active';
    const productType = searchParams.get('productType') || '';
    const productSubtype = searchParams.get('productSubtype') || '';
    const productSubgroup = searchParams.get('productSubgroup') || '';
    const onlyMissingAnvisa = searchParams.get('onlyMissingAnvisa') === '1';

    // Check if any aggregated data exists — if not, skip the agg_computed_at filter
    // so products are visible even before the first rebuild
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
    const params: any[] = [company.id];
    let paramIdx = 2;

    // Line status filter
    if (lineStatus === 'active') {
      conditions.push('(pr.out_of_line IS NULL OR pr.out_of_line = false)');
    } else if (lineStatus === 'outOfLine') {
      conditions.push('pr.out_of_line = true');
    }
    // lineStatus === 'all' → no filter

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
        // Fallback: search in description and code when aggregates not yet built
        conditions.push(`(LOWER(pr.description) LIKE $${paramIdx} OR LOWER(COALESCE(pr.code,'')) LIKE $${paramIdx})`);
      }
      params.push(`%${normalizedSearch}%`);
      paramIdx++;
    }

    const whereClause = conditions.join(' AND ');

    // Sort — fall back to description when aggregates not available
    const sortColumn = hasAggregates
      ? (SORT_COLUMN_MAP[sort] || 'pr.agg_last_issue_date')
      : (sort === 'description' || sort === 'code' || sort === 'ncm' || sort === 'anvisa'
          ? (SORT_COLUMN_MAP[sort] || 'pr.description')
          : 'pr.description');
    const nullsClause = order === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
    let orderClause = `${sortColumn} ${order} ${nullsClause}`;

    // For productType sort, add secondary sort by subtype, subgroup, supplier
    if (sort === 'productType') {
      orderClause = `pr.product_type ${order} ${nullsClause}, pr.product_subtype ${order} ${nullsClause}, pr.product_subgroup ${order} ${nullsClause}, pr.agg_last_supplier_name ASC NULLS LAST`;
    }

    // Always add description as tiebreaker
    orderClause += ', pr.description ASC';

    // Count total
    const countResult = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*) as count FROM product_registry pr WHERE ${whereClause}`,
      ...params,
    );
    const total = Number(countResult[0]?.count || 0);

    const pages = Math.max(1, Math.ceil(total / limit));
    const normalizedPage = Math.min(page, pages);
    const offset = (normalizedPage - 1) * limit;

    // Fetch page
    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        pr.id,
        pr.product_key,
        pr.code,
        pr.description,
        pr.ncm,
        pr.unit,
        pr.ean,
        pr.anvisa_code,
        pr.anvisa_source,
        pr.anvisa_confidence,
        pr.anvisa_matched_product_name,
        pr.anvisa_holder,
        pr.anvisa_process,
        pr.anvisa_status,
        pr.anvisa_expiration,
        pr.anvisa_risk_class,
        pr.anvisa_manufacturer,
        pr.anvisa_manufacturer_country,
        pr.manufacturer_short_name,
        pr.short_name,
        pr.product_type,
        pr.product_subtype,
        pr.product_subgroup,
        pr.out_of_line,
        pr.fiscal_sit_tributaria,
        pr.fiscal_nome_tributacao,
        pr.fiscal_icms,
        pr.fiscal_pis,
        pr.fiscal_cofins,
        pr.fiscal_obs,
        pr.fiscal_cest,
        pr.fiscal_origem,
        pr.fiscal_cfop_entrada,
        pr.fiscal_cfop_saida,
        pr.fiscal_ipi,
        pr.fiscal_fcp,
        pr.agg_total_quantity,
        pr.agg_total_value,
        pr.agg_invoice_count,
        pr.agg_last_price,
        pr.agg_average_price,
        pr.agg_last_issue_date,
        pr.agg_last_supplier_name,
        pr.agg_last_supplier_cnpj,
        pr.agg_last_invoice_number,
        pr.agg_last_sale_date,
        pr.agg_last_sale_price,
        pr.agg_resale_quantity
      FROM product_registry pr
      WHERE ${whereClause}
      ORDER BY ${orderClause}
      LIMIT ${limit} OFFSET ${offset}
      `,
      ...params,
    );

    // Map to ProductRow format (same shape as /api/products)
    const products = rows.map((row) => ({
      key: row.product_key,
      code: row.code || '-',
      description: row.description || '',
      ncm: row.ncm || null,
      unit: row.unit || '-',
      ean: row.ean || null,
      anvisa: row.anvisa_code || null,
      anvisaMatchMethod: row.anvisa_source || null,
      anvisaConfidence: row.anvisa_confidence != null ? Number(row.anvisa_confidence) : null,
      anvisaMatchedProductName: row.anvisa_matched_product_name || null,
      anvisaHolder: row.anvisa_holder || null,
      anvisaProcess: row.anvisa_process || null,
      anvisaStatus: row.anvisa_status || null,
      anvisaExpiration: row.anvisa_expiration || null,
      anvisaRiskClass: row.anvisa_risk_class || null,
      anvisaManufacturer: row.anvisa_manufacturer || null,
      anvisaManufacturerCountry: row.anvisa_manufacturer_country || null,
      manufacturerShortName: row.manufacturer_short_name || null,
      shortName: row.short_name || null,
      productType: row.product_type || null,
      productSubtype: row.product_subtype || null,
      productSubgroup: row.product_subgroup || null,
      outOfLine: row.out_of_line === true || row.out_of_line === 't',
      totalQuantity: Number(row.agg_total_quantity || 0),
      invoiceCount: Number(row.agg_invoice_count || 0),
      lastPrice: Number(row.agg_last_price || 0),
      averagePrice: Number(row.agg_average_price || 0),
      lastIssueDate: row.agg_last_issue_date || null,
      lastSaleDate: row.agg_last_sale_date || null,
      lastSalePrice: row.agg_last_sale_price != null ? Number(row.agg_last_sale_price) : null,
      lastSupplierName: row.agg_last_supplier_name || null,
      lastSupplierCnpj: row.agg_last_supplier_cnpj || null,
      lastInvoiceNumber: row.agg_last_invoice_number || null,
      lastInvoiceId: null,
      fiscalSitTributaria: row.fiscal_sit_tributaria || null,
      fiscalNomeTributacao: row.fiscal_nome_tributacao || null,
      fiscalIcms: row.fiscal_icms != null ? Number(row.fiscal_icms) : null,
      fiscalPis: row.fiscal_pis != null ? Number(row.fiscal_pis) : null,
      fiscalCofins: row.fiscal_cofins != null ? Number(row.fiscal_cofins) : null,
      fiscalObs: row.fiscal_obs || null,
      fiscalCest: row.fiscal_cest || null,
      fiscalOrigem: row.fiscal_origem || null,
      fiscalCfopEntrada: row.fiscal_cfop_entrada || null,
      fiscalCfopSaida: row.fiscal_cfop_saida || null,
      fiscalIpi: row.fiscal_ipi != null ? Number(row.fiscal_ipi) : null,
      fiscalFcp: row.fiscal_fcp != null ? Number(row.fiscal_fcp) : null,
    }));

    // Summary counts (from full filtered set, not just page)
    const summaryResult = await prisma.$queryRawUnsafe<any[]>(
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
        page: normalizedPage,
        limit,
        total,
        pages,
      },
      needsRebuild: !hasAggregates,
    });
  } catch (error) {
    console.error('[products/list] Error:', error);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
