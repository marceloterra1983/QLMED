import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';

export interface ProductRegistryRow {
  id: string;
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
  anvisaExpiration: string | null;
  anvisaRiskClass: string | null;
  anvisaManufacturer: string | null;
  anvisaManufacturerCountry: string | null;
  manufacturerShortName: string | null;
  anvisaSyncedAt: Date | null;
  shortName: string | null;
  productType: string | null;
  productSubtype: string | null;
  outOfLine: boolean;
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

type RegistryInitState = {
  promise?: Promise<void>;
};

const globalRegistryState = globalThis as unknown as {
  productRegistryInitState?: RegistryInitState;
};

const registryInitState: RegistryInitState =
  globalRegistryState.productRegistryInitState || {};

if (process.env.NODE_ENV !== 'production') {
  globalRegistryState.productRegistryInitState = registryInitState;
}

export async function ensureProductRegistryTable() {
  if (!registryInitState.promise) {
    registryInitState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS product_registry (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          product_key TEXT NOT NULL,
          code TEXT,
          description TEXT NOT NULL,
          ncm TEXT,
          unit TEXT,
          ean TEXT,
          anvisa_code TEXT,
          anvisa_source TEXT,
          anvisa_confidence DOUBLE PRECISION,
          anvisa_matched_product_name TEXT,
          anvisa_holder TEXT,
          anvisa_process TEXT,
          anvisa_status TEXT,
          anvisa_synced_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (company_id, product_key)
        )
      `);

      // Add columns that may not exist in older installations
      await prisma.$executeRawUnsafe(`
        ALTER TABLE product_registry
          ADD COLUMN IF NOT EXISTS product_type TEXT,
          ADD COLUMN IF NOT EXISTS product_subtype TEXT,
          ADD COLUMN IF NOT EXISTS anvisa_expiration TEXT,
          ADD COLUMN IF NOT EXISTS anvisa_risk_class TEXT,
          ADD COLUMN IF NOT EXISTS anvisa_manufacturer TEXT,
          ADD COLUMN IF NOT EXISTS anvisa_manufacturer_country TEXT,
          ADD COLUMN IF NOT EXISTS short_name TEXT,
          ADD COLUMN IF NOT EXISTS manufacturer_short_name TEXT,
          ADD COLUMN IF NOT EXISTS out_of_line BOOLEAN DEFAULT FALSE
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_company_idx
        ON product_registry (company_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_company_anvisa_idx
        ON product_registry (company_id, anvisa_code)
      `);
    })().catch((error) => {
      registryInitState.promise = undefined;
      throw error;
    });
  }

  return registryInitState.promise;
}

function mapRegistryRow(row: any): ProductRegistryRow {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    productKey: String(row.product_key),
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
    outOfLine: row.out_of_line === true || row.out_of_line === 't' || row.out_of_line === 1,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function getProductRegistryByKeys(
  companyId: string,
  productKeys: string[],
): Promise<ProductRegistryRow[]> {
  await ensureProductRegistryTable();
  if (productKeys.length === 0) return [];

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        company_id,
        product_key,
        code,
        description,
        ncm,
        unit,
        ean,
        anvisa_code,
        anvisa_source,
        anvisa_confidence,
        anvisa_matched_product_name,
        anvisa_holder,
        anvisa_process,
        anvisa_status,
        anvisa_expiration,
        anvisa_risk_class,
        anvisa_manufacturer,
        anvisa_manufacturer_country,
        manufacturer_short_name,
        anvisa_synced_at,
        short_name,
        product_type,
        product_subtype,
        out_of_line,
        created_at,
        updated_at
      FROM product_registry
      WHERE company_id = $1
        AND product_key = ANY($2::text[])
    `,
    companyId,
    productKeys,
  );

  return rows.map(mapRegistryRow);
}

export async function getProductRegistryWithAnvisa(
  companyId: string,
): Promise<ProductRegistryRow[]> {
  await ensureProductRegistryTable();

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        company_id,
        product_key,
        code,
        description,
        ncm,
        unit,
        ean,
        anvisa_code,
        anvisa_source,
        anvisa_confidence,
        anvisa_matched_product_name,
        anvisa_holder,
        anvisa_process,
        anvisa_status,
        anvisa_expiration,
        anvisa_risk_class,
        anvisa_manufacturer,
        anvisa_manufacturer_country,
        manufacturer_short_name,
        anvisa_synced_at,
        short_name,
        product_type,
        product_subtype,
        out_of_line,
        created_at,
        updated_at
      FROM product_registry
      WHERE company_id = $1
        AND anvisa_code IS NOT NULL
        AND anvisa_code != ''
      ORDER BY updated_at DESC
    `,
    companyId,
  );

  return rows.map(mapRegistryRow);
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
  await ensureProductRegistryTable();

  await prisma.$executeRawUnsafe(
    `
      UPDATE product_registry SET
        anvisa_matched_product_name = $2,
        anvisa_holder = $3,
        anvisa_process = $4,
        anvisa_status = $5,
        anvisa_expiration = $6,
        anvisa_risk_class = $7,
        anvisa_manufacturer = $8,
        anvisa_manufacturer_country = $9,
        anvisa_synced_at = $10,
        updated_at = NOW()
      WHERE id = $1
    `,
    id,
    data.anvisaMatchedProductName,
    data.anvisaHolder,
    data.anvisaProcess,
    data.anvisaStatus,
    data.anvisaExpiration,
    data.anvisaRiskClass,
    data.anvisaManufacturer,
    data.anvisaManufacturerCountry,
    data.anvisaSyncedAt,
  );
}

export async function upsertProductRegistry(
  input: UpsertProductRegistryInput,
): Promise<void> {
  await ensureProductRegistryTable();

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO product_registry (
        id,
        company_id,
        product_key,
        code,
        description,
        ncm,
        unit,
        ean,
        anvisa_code,
        anvisa_source,
        anvisa_confidence,
        anvisa_matched_product_name,
        anvisa_holder,
        anvisa_process,
        anvisa_status,
        anvisa_expiration,
        anvisa_risk_class,
        anvisa_synced_at,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW()
      )
      ON CONFLICT (company_id, product_key)
      DO UPDATE SET
        code = EXCLUDED.code,
        description = EXCLUDED.description,
        ncm = EXCLUDED.ncm,
        unit = EXCLUDED.unit,
        ean = EXCLUDED.ean,
        anvisa_code = EXCLUDED.anvisa_code,
        anvisa_source = EXCLUDED.anvisa_source,
        anvisa_confidence = EXCLUDED.anvisa_confidence,
        anvisa_matched_product_name = EXCLUDED.anvisa_matched_product_name,
        anvisa_holder = EXCLUDED.anvisa_holder,
        anvisa_process = EXCLUDED.anvisa_process,
        anvisa_status = EXCLUDED.anvisa_status,
        anvisa_expiration = EXCLUDED.anvisa_expiration,
        anvisa_risk_class = EXCLUDED.anvisa_risk_class,
        anvisa_synced_at = EXCLUDED.anvisa_synced_at,
        updated_at = NOW()
    `,
    randomUUID(),
    input.companyId,
    input.productKey,
    input.code,
    input.description,
    input.ncm,
    input.unit,
    input.ean,
    input.anvisaCode,
    input.anvisaSource,
    input.anvisaConfidence,
    input.anvisaMatchedProductName,
    input.anvisaHolder,
    input.anvisaProcess,
    input.anvisaStatus,
    input.anvisaExpiration ?? null,
    input.anvisaRiskClass ?? null,
    input.anvisaSyncedAt,
  );
}
