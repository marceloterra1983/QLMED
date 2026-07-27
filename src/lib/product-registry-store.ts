import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('product-registry-store');

export interface ProductRegistryRow {
  id: string;
  companyId: string;
  productKey: string;
  codigo: string | null;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisaCode: string | null;
  anvisaSource: string | null;
  anvisaConfidence: number | null;
  anvisaMatchedProductName: string | null;
  anvisaHolder: string | null;
  anvisaProcess: string | null;
  anvisaStatus: string | null;
  anvisaExpiration: string | null;
  anvisaRiskClass: string | null;
  anvisaManufacturer: string | null;
  anvisaManufacturerCountry: string | null;
  manufacturerShortName: string | null;
  anvisaSyncedAt: Date | null;
  shortName: string | null;
  productType: string | null;
  productSubtype: string | null;
  productSubgroup: string | null;
  outOfLine: boolean;
  instrumental: boolean;
  fiscalSitTributaria: string | null;
  fiscalNomeTributacao: string | null;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalObs: string | null;
  fiscalCest: string | null;
  fiscalOrigem: string | null;
  fiscalCfopEntrada: string | null;
  fiscalCfopSaida: string | null;
  fiscalIpi: number | null;
  fiscalFcp: number | null;
  fiscalCstIpi: string | null;
  fiscalCstPis: string | null;
  fiscalCstCofins: string | null;
  fiscalObsIcms: string | null;
  fiscalObsPisCofins: string | null;
  productRefs: string[];
  defaultSupplier: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpsertProductRegistryInput {
  companyId: string;
  productKey: string;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisaCode: string | null;
  anvisaSource: string | null;
  anvisaConfidence: number | null;
  anvisaMatchedProductName: string | null;
  anvisaHolder: string | null;
  anvisaProcess: string | null;
  anvisaStatus: string | null;
  anvisaSyncedAt: Date | null;
  anvisaExpiration?: string | null;
  anvisaRiskClass?: string | null;
}

// ── DB row interface (snake_case, matching SQL columns) ──

interface ProductRegistryDbRow {
  id: string;
  company_id: string;
  product_key: string;
  codigo: string | null;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisa_code: string | null;
  anvisa_source: string | null;
  anvisa_confidence: number | null;
  anvisa_matched_product_name: string | null;
  anvisa_holder: string | null;
  anvisa_process: string | null;
  anvisa_status: string | null;
  anvisa_expiration: string | null;
  anvisa_risk_class: string | null;
  anvisa_manufacturer: string | null;
  anvisa_manufacturer_country: string | null;
  manufacturer_short_name: string | null;
  anvisa_synced_at: string | Date | null;
  short_name: string | null;
  product_type: string | null;
  product_subtype: string | null;
  product_subgroup: string | null;
  out_of_line: boolean | string | number | null;
  instrumental: boolean | string | number | null;
  fiscal_sit_tributaria: string | null;
  fiscal_nome_tributacao: string | null;
  fiscal_icms: number | null;
  fiscal_pis: number | null;
  fiscal_cofins: number | null;
  fiscal_obs: string | null;
  fiscal_cest: string | null;
  fiscal_origem: string | null;
  fiscal_cfop_entrada: string | null;
  fiscal_cfop_saida: string | null;
  fiscal_ipi: number | null;
  fiscal_fcp: number | null;
  fiscal_cst_ipi: string | null;
  fiscal_cst_pis: string | null;
  fiscal_cst_cofins: string | null;
  fiscal_obs_icms: string | null;
  fiscal_obs_pis_cofins: string | null;
  product_refs: string[] | null;
  default_supplier: string | null;
  agg_total_quantity: number | null;
  agg_total_value: number | null;
  agg_invoice_count: number | null;
  agg_last_price: number | null;
  agg_average_price: number | null;
  agg_last_issue_date: string | Date | null;
  agg_last_supplier_name: string | null;
  agg_last_supplier_cnpj: string | null;
  agg_last_invoice_number: string | null;
  agg_last_sale_date: string | Date | null;
  agg_last_sale_price: number | null;
  agg_resale_quantity: number | null;
  agg_computed_at: string | Date | null;
  agg_search_text: string | null;
  created_at: string | Date;
  updated_at: string | Date;
}

function mapRegistryRow(row: ProductRegistryDbRow): ProductRegistryRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productKey: String(row.product_key),
    codigo: row.codigo ?? null,
    code: row.code ?? null,
    description: String(row.description || ''),
    ncm: row.ncm ?? null,
    unit: row.unit ?? null,
    ean: row.ean ?? null,
    anvisaCode: row.anvisa_code ?? null,
    anvisaSource: row.anvisa_source ?? null,
    anvisaConfidence: row.anvisa_confidence === null || row.anvisa_confidence === undefined
      ? null
      : Number(row.anvisa_confidence),
    anvisaMatchedProductName: row.anvisa_matched_product_name ?? null,
    anvisaHolder: row.anvisa_holder ?? null,
    anvisaProcess: row.anvisa_process ?? null,
    anvisaStatus: row.anvisa_status ?? null,
    anvisaExpiration: row.anvisa_expiration ?? null,
    anvisaRiskClass: row.anvisa_risk_class ?? null,
    anvisaManufacturer: row.anvisa_manufacturer ?? null,
    anvisaManufacturerCountry: row.anvisa_manufacturer_country ?? null,
    manufacturerShortName: row.manufacturer_short_name ?? null,
    anvisaSyncedAt: row.anvisa_synced_at ? new Date(row.anvisa_synced_at) : null,
    shortName: row.short_name ?? null,
    productType: row.product_type ?? null,
    productSubtype: row.product_subtype ?? null,
    productSubgroup: row.product_subgroup ?? null,
    outOfLine: row.out_of_line === true || row.out_of_line === 't' || row.out_of_line === 1,
    instrumental: row.instrumental === true || row.instrumental === 't' || row.instrumental === 1,
    fiscalSitTributaria: row.fiscal_sit_tributaria ?? null,
    fiscalNomeTributacao: row.fiscal_nome_tributacao ?? null,
    fiscalIcms: row.fiscal_icms === null || row.fiscal_icms === undefined ? null : Number(row.fiscal_icms),
    fiscalPis: row.fiscal_pis === null || row.fiscal_pis === undefined ? null : Number(row.fiscal_pis),
    fiscalCofins: row.fiscal_cofins === null || row.fiscal_cofins === undefined ? null : Number(row.fiscal_cofins),
    fiscalObs: row.fiscal_obs ?? null,
    fiscalCest: row.fiscal_cest ?? null,
    fiscalOrigem: row.fiscal_origem ?? null,
    fiscalCfopEntrada: row.fiscal_cfop_entrada ?? null,
    fiscalCfopSaida: row.fiscal_cfop_saida ?? null,
    fiscalIpi: row.fiscal_ipi === null || row.fiscal_ipi === undefined ? null : Number(row.fiscal_ipi),
    fiscalFcp: row.fiscal_fcp === null || row.fiscal_fcp === undefined ? null : Number(row.fiscal_fcp),
    fiscalCstIpi:       row.fiscal_cst_ipi       ?? null,
    fiscalCstPis:       row.fiscal_cst_pis       ?? null,
    fiscalCstCofins:    row.fiscal_cst_cofins    ?? null,
    fiscalObsIcms:      row.fiscal_obs_icms      ?? null,
    fiscalObsPisCofins: row.fiscal_obs_pis_cofins ?? null,
    productRefs: Array.isArray(row.product_refs) ? row.product_refs : [],
    defaultSupplier: row.default_supplier ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

/** Map Prisma ProductRegistry model → domain row */
function mapPrismaRegistryRow(row: {
  id: string;
  companyId: string;
  productKey: string;
  codigo: string | null;
  code: string | null;
  description: string;
  ncm: string | null;
  unit: string | null;
  ean: string | null;
  anvisaCode: string | null;
  anvisaSource: string | null;
  anvisaConfidence: number | null;
  anvisaMatchedProductName: string | null;
  anvisaHolder: string | null;
  anvisaProcess: string | null;
  anvisaStatus: string | null;
  anvisaExpiration: string | null;
  anvisaRiskClass: string | null;
  anvisaManufacturer: string | null;
  anvisaManufacturerCountry: string | null;
  manufacturerShortName: string | null;
  anvisaSyncedAt: Date | null;
  shortName: string | null;
  productType: string | null;
  productSubtype: string | null;
  productSubgroup: string | null;
  outOfLine: boolean | null;
  instrumental: boolean | null;
  fiscalSitTributaria: string | null;
  fiscalNomeTributacao: string | null;
  fiscalIcms: number | null;
  fiscalPis: number | null;
  fiscalCofins: number | null;
  fiscalObs: string | null;
  fiscalCest: string | null;
  fiscalOrigem: string | null;
  fiscalCfopEntrada: string | null;
  fiscalCfopSaida: string | null;
  fiscalIpi: number | null;
  fiscalFcp: number | null;
  fiscalCstIpi: string | null;
  fiscalCstPis: string | null;
  fiscalCstCofins: string | null;
  fiscalObsIcms: string | null;
  fiscalObsPisCofins: string | null;
  productRefs: string[];
  defaultSupplier: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProductRegistryRow {
  return {
    id: row.id,
    companyId: row.companyId,
    productKey: row.productKey,
    codigo: row.codigo ?? null,
    code: row.code ?? null,
    description: row.description || '',
    ncm: row.ncm ?? null,
    unit: row.unit ?? null,
    ean: row.ean ?? null,
    anvisaCode: row.anvisaCode ?? null,
    anvisaSource: row.anvisaSource ?? null,
    anvisaConfidence: row.anvisaConfidence ?? null,
    anvisaMatchedProductName: row.anvisaMatchedProductName ?? null,
    anvisaHolder: row.anvisaHolder ?? null,
    anvisaProcess: row.anvisaProcess ?? null,
    anvisaStatus: row.anvisaStatus ?? null,
    anvisaExpiration: row.anvisaExpiration ?? null,
    anvisaRiskClass: row.anvisaRiskClass ?? null,
    anvisaManufacturer: row.anvisaManufacturer ?? null,
    anvisaManufacturerCountry: row.anvisaManufacturerCountry ?? null,
    manufacturerShortName: row.manufacturerShortName ?? null,
    anvisaSyncedAt: row.anvisaSyncedAt,
    shortName: row.shortName ?? null,
    productType: row.productType ?? null,
    productSubtype: row.productSubtype ?? null,
    productSubgroup: row.productSubgroup ?? null,
    outOfLine: Boolean(row.outOfLine),
    instrumental: Boolean(row.instrumental),
    fiscalSitTributaria: row.fiscalSitTributaria ?? null,
    fiscalNomeTributacao: row.fiscalNomeTributacao ?? null,
    fiscalIcms: row.fiscalIcms ?? null,
    fiscalPis: row.fiscalPis ?? null,
    fiscalCofins: row.fiscalCofins ?? null,
    fiscalObs: row.fiscalObs ?? null,
    fiscalCest: row.fiscalCest ?? null,
    fiscalOrigem: row.fiscalOrigem ?? null,
    fiscalCfopEntrada: row.fiscalCfopEntrada ?? null,
    fiscalCfopSaida: row.fiscalCfopSaida ?? null,
    fiscalIpi: row.fiscalIpi ?? null,
    fiscalFcp: row.fiscalFcp ?? null,
    fiscalCstIpi: row.fiscalCstIpi ?? null,
    fiscalCstPis: row.fiscalCstPis ?? null,
    fiscalCstCofins: row.fiscalCstCofins ?? null,
    fiscalObsIcms: row.fiscalObsIcms ?? null,
    fiscalObsPisCofins: row.fiscalObsPisCofins ?? null,
    productRefs: Array.isArray(row.productRefs) ? row.productRefs : [],
    defaultSupplier: row.defaultSupplier ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getProductRegistryByKeys(
  companyId: string,
  productKeys: string[],
): Promise<ProductRegistryRow[]> {
  if (productKeys.length === 0) return [];

  const rows = await prisma.productRegistry.findMany({
    where: { companyId, productKey: { in: productKeys } },
  });
  return rows.map(mapPrismaRegistryRow);
}

export async function getProductRegistryWithAnvisa(
  companyId: string,
): Promise<ProductRegistryRow[]> {
  const rows = await prisma.productRegistry.findMany({
    where: {
      companyId,
      anvisaCode: { not: null },
      NOT: { anvisaCode: '' },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return rows.map(mapPrismaRegistryRow);
}

export async function updateRegistryAnvisaData(
  id: string,
  data: {
    anvisaMatchedProductName: string | null;
    anvisaHolder: string | null;
    anvisaProcess: string | null;
    anvisaStatus: string | null;
    anvisaExpiration: string | null;
    anvisaRiskClass: string | null;
    anvisaManufacturer: string | null;
    anvisaManufacturerCountry: string | null;
    anvisaSyncedAt: Date;
  },
): Promise<void> {
  await prisma.productRegistry.update({
    where: { id },
    data: {
      anvisaMatchedProductName: data.anvisaMatchedProductName,
      anvisaHolder: data.anvisaHolder,
      anvisaProcess: data.anvisaProcess,
      anvisaStatus: data.anvisaStatus,
      anvisaExpiration: data.anvisaExpiration,
      anvisaRiskClass: data.anvisaRiskClass,
      anvisaManufacturer: data.anvisaManufacturer,
      anvisaManufacturerCountry: data.anvisaManufacturerCountry,
      anvisaSyncedAt: data.anvisaSyncedAt,
      updatedAt: new Date(),
    },
  });
}

export async function upsertProductRegistry(
  input: UpsertProductRegistryInput,
): Promise<void> {
  const existing = await prisma.productRegistry.findUnique({
    where: {
      companyId_productKey: {
        companyId: input.companyId,
        productKey: input.productKey,
      },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.productRegistry.update({
      where: { id: existing.id },
      data: {
        code: input.code,
        description: input.description,
        ncm: input.ncm,
        unit: input.unit,
        ean: input.ean,
        anvisaCode: input.anvisaCode,
        anvisaSource: input.anvisaSource,
        anvisaConfidence: input.anvisaConfidence,
        anvisaMatchedProductName: input.anvisaMatchedProductName,
        anvisaHolder: input.anvisaHolder,
        anvisaProcess: input.anvisaProcess,
        anvisaStatus: input.anvisaStatus,
        anvisaExpiration: input.anvisaExpiration ?? null,
        anvisaRiskClass: input.anvisaRiskClass ?? null,
        anvisaSyncedAt: input.anvisaSyncedAt,
        updatedAt: new Date(),
      },
    });
    return;
  }

  const codigos = await prisma.productRegistry.findMany({
    where: { companyId: input.companyId, NOT: { codigo: null } },
    select: { codigo: true },
  });
  let maxNum = 0;
  for (const row of codigos) {
    const digits = (row.codigo || '').replace(/\D/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  const nextCodigo = String(maxNum + 1).padStart(5, '0');

  await prisma.productRegistry.create({
    data: {
      id: randomUUID(),
      companyId: input.companyId,
      productKey: input.productKey,
      code: input.code,
      description: input.description,
      ncm: input.ncm,
      unit: input.unit,
      ean: input.ean,
      anvisaCode: input.anvisaCode,
      anvisaSource: input.anvisaSource,
      anvisaConfidence: input.anvisaConfidence,
      anvisaMatchedProductName: input.anvisaMatchedProductName,
      anvisaHolder: input.anvisaHolder,
      anvisaProcess: input.anvisaProcess,
      anvisaStatus: input.anvisaStatus,
      anvisaExpiration: input.anvisaExpiration ?? null,
      anvisaRiskClass: input.anvisaRiskClass ?? null,
      anvisaSyncedAt: input.anvisaSyncedAt,
      outOfLine: true,
      codigo: nextCodigo,
    },
  });
}
