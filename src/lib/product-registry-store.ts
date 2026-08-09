import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';


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
