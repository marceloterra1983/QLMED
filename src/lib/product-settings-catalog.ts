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
  | 'fiscal_obs_pis_cofins'
  | 'fiscal_aliq_icms'
  | 'fiscal_aliq_pis'
  | 'fiscal_aliq_cofins'
  | 'fiscal_aliq_ipi'
  | 'fiscal_aliq_fcp';

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

// product_settings_catalog is schema-owned (Phase 11 baseline). No CREATE/ALTER at runtime.

export function toCatalogKey(value: string | null | undefined): string {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : '';
}

function mapCatalogRow(row: {
  id: string;
  companyId: string;
  section: string;
  value: string;
  parentValue: string | null;
  parentSecondaryValue: string | null;
  extraValue: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ProductSettingsCatalogEntry {
  return {
    id: row.id,
    companyId: row.companyId,
    section: row.section as ProductSettingsCatalogSection,
    value: row.value,
    parentValue: row.parentValue ?? null,
    parentSecondaryValue: row.parentSecondaryValue ?? null,
    extraValue: row.extraValue ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProductSettingsCatalogEntries(
  companyId: string,
): Promise<ProductSettingsCatalogEntry[]> {
  const rows = await prisma.productSettingsCatalog.findMany({
    where: { companyId },
    orderBy: [{ section: 'asc' }, { value: 'asc' }],
  });
  return rows.map(mapCatalogRow);
}

export async function upsertProductSettingsCatalogEntry(input: {
  companyId: string;
  section: ProductSettingsCatalogSection;
  value: string;
  parentValue?: string | null;
  parentSecondaryValue?: string | null;
  extraValue?: string | null;
}): Promise<void> {
  const value = input.value.trim();
  if (!value) return;

  const parentValueKey = toCatalogKey(input.parentValue);
  const parentSecondaryValueKey = toCatalogKey(input.parentSecondaryValue);
  const parentValue = parentValueKey || null;
  const parentSecondaryValue = parentSecondaryValueKey || null;
  const extraValue = input.extraValue?.trim() || null;
  const now = new Date();

  await prisma.productSettingsCatalog.upsert({
    where: {
      companyId_section_value_parentValueKey_parentSecondaryValueKey: {
        companyId: input.companyId,
        section: input.section,
        value,
        parentValueKey,
        parentSecondaryValueKey,
      },
    },
    create: {
      id: randomUUID(),
      companyId: input.companyId,
      section: input.section,
      value,
      parentValue,
      parentSecondaryValue,
      parentValueKey,
      parentSecondaryValueKey,
      extraValue,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      extraValue,
      updatedAt: now,
    },
  });
}
