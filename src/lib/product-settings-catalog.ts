import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';

export type ProductSettingsCatalogSection =
  | 'line'
  | 'group'
  | 'subgroup'
  | 'manufacturer'
  | 'fiscal_ncm'
  | 'fiscal_sit_tributaria'
  | 'fiscal_nome_tributacao'
  | 'fiscal_cest'
  | 'fiscal_origem'
  | 'fiscal_cfop_entrada'
  | 'fiscal_cfop_saida'
  | 'fiscal_obs_icms'
  | 'fiscal_obs_pis_cofins';

export interface ProductSettingsCatalogEntry {
  id: string;
  companyId: string;
  section: ProductSettingsCatalogSection;
  value: string;
  parentValue: string | null;
  parentSecondaryValue: string | null;
  extraValue: string | null;
  createdAt: Date;
  updatedAt: Date;
}

type CatalogInitState = {
  promise?: Promise<void>;
};

const globalCatalogState = globalThis as unknown as {
  productSettingsCatalogInitState?: CatalogInitState;
};

const catalogInitState: CatalogInitState =
  globalCatalogState.productSettingsCatalogInitState || {};

if (process.env.NODE_ENV !== 'production') {
  globalCatalogState.productSettingsCatalogInitState = catalogInitState;
}

export function toCatalogKey(value: string | null | undefined): string {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : '';
}

function clean(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized.length > 0 ? normalized : null;
}

function mapCatalogRow(row: any): ProductSettingsCatalogEntry {
  return {
    id: String(row.id),
    companyId: String(row.company_id),
    section: String(row.section) as ProductSettingsCatalogSection,
    value: String(row.value),
    parentValue: row.parent_value ?? null,
    parentSecondaryValue: row.parent_secondary_value ?? null,
    extraValue: row.extra_value ?? null,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function ensureProductSettingsCatalogTable() {
  if (!catalogInitState.promise) {
    catalogInitState.promise = (async () => {
      await prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS product_settings_catalog (
          id TEXT PRIMARY KEY,
          company_id TEXT NOT NULL,
          section TEXT NOT NULL,
          value TEXT NOT NULL,
          parent_value TEXT,
          parent_secondary_value TEXT,
          parent_value_key TEXT NOT NULL DEFAULT '',
          parent_secondary_value_key TEXT NOT NULL DEFAULT '',
          extra_value TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE UNIQUE INDEX IF NOT EXISTS product_settings_catalog_unique_idx
        ON product_settings_catalog (
          company_id,
          section,
          value,
          parent_value_key,
          parent_secondary_value_key
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS product_settings_catalog_company_idx
        ON product_settings_catalog (company_id)
      `);
    })().catch((error) => {
      catalogInitState.promise = undefined;
      throw error;
    });
  }

  return catalogInitState.promise;
}

export async function listProductSettingsCatalogEntries(
  companyId: string,
): Promise<ProductSettingsCatalogEntry[]> {
  await ensureProductSettingsCatalogTable();

  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT
        id,
        company_id,
        section,
        value,
        parent_value,
        parent_secondary_value,
        extra_value,
        created_at,
        updated_at
      FROM product_settings_catalog
      WHERE company_id = $1
      ORDER BY section ASC, value ASC
    `,
    companyId,
  );

  return rows.map(mapCatalogRow);
}

export async function upsertProductSettingsCatalogEntry(input: {
  companyId: string;
  section: ProductSettingsCatalogSection;
  value: string;
  parentValue?: string | null;
  parentSecondaryValue?: string | null;
  extraValue?: string | null;
}) {
  await ensureProductSettingsCatalogTable();

  const value = input.value.trim();
  if (!value) return;

  const parentValue = toCatalogKey(input.parentValue);
  const parentSecondaryValue = toCatalogKey(input.parentSecondaryValue);

  await prisma.$executeRawUnsafe(
    `
      INSERT INTO product_settings_catalog (
        id,
        company_id,
        section,
        value,
        parent_value,
        parent_secondary_value,
        parent_value_key,
        parent_secondary_value_key,
        extra_value,
        created_at,
        updated_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      )
      ON CONFLICT (company_id, section, value, parent_value_key, parent_secondary_value_key)
      DO UPDATE SET
        extra_value = EXCLUDED.extra_value,
        updated_at = NOW()
    `,
    randomUUID(),
    input.companyId,
    input.section,
    value,
    parentValue || null,
    parentSecondaryValue || null,
    parentValue,
    parentSecondaryValue,
    input.extraValue?.trim() || null,
  );
}
