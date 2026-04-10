import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import { createLogger } from '@/lib/logger';
import { apiError } from '@/lib/api-error';

const log = createLogger('products/details');

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
    const key = searchParams.get('key');
    const code = searchParams.get('code');

    if (!key && !code) {
      return NextResponse.json({ error: 'Parâmetro key ou code obrigatório' }, { status: 400 });
    }

    const whereClause = key ? 'pr.company_id = $1 AND pr.product_key = $2' : 'pr.company_id = $1 AND pr.code = $2';
    const whereParam = key ?? code;

    const rows = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        pr.product_key,
        pr.codigo,
        pr.code,
        pr.description,
        pr.ncm,
        pr.unit,
        pr.ean,
        pr.short_name,
        pr.manufacturer_short_name,
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
        pr.product_type,
        pr.product_subtype,
        pr.product_subgroup,
        pr.out_of_line,
        pr.instrumental,
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
        pr.fiscal_cst_ipi,
        pr.fiscal_cst_pis,
        pr.fiscal_cst_cofins,
        pr.fiscal_obs_icms,
        pr.fiscal_obs_pis_cofins,
        pr.product_refs,
        pr.default_supplier,
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
      LIMIT 1
      `,
      company.id,
      whereParam,
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Produto não encontrado' }, { status: 404 });
    }

    const row = rows[0];
    return NextResponse.json({
      key: row.product_key,
      codigo: row.codigo || null,
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
      instrumental: row.instrumental === true || row.instrumental === 't',
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
      fiscalCstIpi:       row.fiscal_cst_ipi       || null,
      fiscalCstPis:       row.fiscal_cst_pis       || null,
      fiscalCstCofins:    row.fiscal_cst_cofins    || null,
      fiscalObsIcms:      row.fiscal_obs_icms      || null,
      fiscalObsPisCofins: row.fiscal_obs_pis_cofins || null,
      productRefs: Array.isArray(row.product_refs) ? row.product_refs : [],
      defaultSupplier: row.default_supplier || null,
    });
  } catch (error) {
    return apiError(error, 'products/details');
  }
}
