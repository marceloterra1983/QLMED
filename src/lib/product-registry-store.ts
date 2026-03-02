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
          ADD COLUMN IF NOT EXISTS out_of_line BOOLEAN DEFAULT FALSE,
          ADD COLUMN IF NOT EXISTS fiscal_sit_tributaria TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_nome_tributacao TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_icms DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS fiscal_pis DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS fiscal_cofins DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS fiscal_obs TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_cest TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_origem TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_cfop_entrada TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_cfop_saida TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_ipi DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS fiscal_fcp DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS fiscal_cst_ipi TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_cst_pis TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_cst_cofins TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_obs_icms TEXT,
          ADD COLUMN IF NOT EXISTS fiscal_obs_pis_cofins TEXT,
          ADD COLUMN IF NOT EXISTS product_subgroup TEXT,
          ADD COLUMN IF NOT EXISTS agg_total_quantity DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_total_value DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_invoice_count INTEGER,
          ADD COLUMN IF NOT EXISTS agg_last_price DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_average_price DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_last_issue_date TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS agg_last_supplier_name TEXT,
          ADD COLUMN IF NOT EXISTS agg_last_supplier_cnpj TEXT,
          ADD COLUMN IF NOT EXISTS agg_last_invoice_number TEXT,
          ADD COLUMN IF NOT EXISTS agg_last_sale_date TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS agg_last_sale_price DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_resale_quantity DOUBLE PRECISION,
          ADD COLUMN IF NOT EXISTS agg_computed_at TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS agg_search_text TEXT,
          ADD COLUMN IF NOT EXISTS codigo TEXT,
          ADD COLUMN IF NOT EXISTS product_refs TEXT[]
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_company_idx
        ON product_registry (company_id)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_company_anvisa_idx
        ON product_registry (company_id, anvisa_code)
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_agg_issue_idx
        ON product_registry (company_id, agg_last_issue_date DESC NULLS LAST)
        WHERE agg_computed_at IS NOT NULL
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_agg_type_idx
        ON product_registry (company_id, product_type, product_subtype)
        WHERE agg_computed_at IS NOT NULL
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_registry_out_of_line_idx
        ON product_registry (company_id, out_of_line)
        WHERE agg_computed_at IS NOT NULL
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS product_registry_company_codigo_idx
        ON product_registry (company_id, codigo)
        WHERE codigo IS NOT NULL
      `);

      try {
        await prisma.$executeRawUnsafe(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
        await prisma.$executeRawUnsafe(`
          CREATE INDEX IF NOT EXISTS product_registry_search_trgm_idx
          ON product_registry USING gin (agg_search_text gin_trgm_ops)
          WHERE agg_computed_at IS NOT NULL
        `);
      } catch {
        // pg_trgm may not be available — trigram search will fall back to ILIKE
      }

      // Migrate product_key unit tokens to normalized form
      // e.g. CODE:123::UNIT:UNID → CODE:123::UNIT:UN
      const unitAliases: Record<string, string> = {
        UNID: 'UN', UND: 'UN', UNIDADE: 'UN', UNIDADES: 'UN',
        PC: 'UN', 'PÇ': 'UN', PECA: 'UN', 'PEÇA': 'UN', PCS: 'UN',
        CAIXA: 'CX', KT: 'KIT', PR: 'PAR',
      };
      for (const [from, to] of Object.entries(unitAliases)) {
        // Update keys that end with ::UNIT:{from} to ::UNIT:{to}
        // Use ON CONFLICT to handle collisions (merge by deleting the old row)
        await prisma.$executeRawUnsafe(`
          DELETE FROM product_registry
          WHERE id IN (
            SELECT old.id FROM product_registry old
            INNER JOIN product_registry existing
              ON existing.company_id = old.company_id
              AND existing.product_key = REPLACE(old.product_key, '::UNIT:${from}', '::UNIT:${to}')
            WHERE old.product_key LIKE '%::UNIT:${from}'
              AND old.product_key != existing.product_key
          )
        `);
        await prisma.$executeRawUnsafe(`
          UPDATE product_registry
          SET product_key = REPLACE(product_key, '::UNIT:${from}', '::UNIT:${to}'),
              updated_at = NOW()
          WHERE product_key LIKE '%::UNIT:${from}'
        `);
      }
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
        codigo,
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
        product_subgroup,
        out_of_line,
        fiscal_sit_tributaria,
        fiscal_nome_tributacao,
        fiscal_icms,
        fiscal_pis,
        fiscal_cofins,
        fiscal_obs,
        fiscal_cest,
        fiscal_origem,
        fiscal_cfop_entrada,
        fiscal_cfop_saida,
        fiscal_ipi,
        fiscal_fcp,
        fiscal_cst_ipi,
        fiscal_cst_pis,
        fiscal_cst_cofins,
        fiscal_obs_icms,
        fiscal_obs_pis_cofins,
        product_refs,
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
        codigo,
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
        product_subgroup,
        out_of_line,
        fiscal_sit_tributaria,
        fiscal_nome_tributacao,
        fiscal_icms,
        fiscal_pis,
        fiscal_cofins,
        fiscal_obs,
        fiscal_cest,
        fiscal_origem,
        fiscal_cfop_entrada,
        fiscal_cfop_saida,
        fiscal_ipi,
        fiscal_fcp,
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
        codigo,
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
