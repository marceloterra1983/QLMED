import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  upsertProductSettingsCatalogEntry,
  type ProductSettingsCatalogSection,
} from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';
import { apiValidationError } from '@/lib/api-error';
import { renameFiscalSchema } from '@/lib/schemas/product';

const VALID_FIELDS = ['ncm', 'fiscalSitTributaria', 'fiscalNomeTributacao', 'cest', 'origem', 'cfopEntrada', 'cfopSaida', 'obsIcms', 'obsPisCofins', 'aliqIcms', 'aliqPis', 'aliqCofins', 'aliqIpi', 'aliqFcp'] as const;
type FiscalField = (typeof VALID_FIELDS)[number];

// null means catalog-only (no corresponding TEXT column in product_registry)
const DB_COLUMN: Record<FiscalField, string | null> = {
  ncm: 'ncm',
  fiscalSitTributaria: 'fiscal_sit_tributaria',
  fiscalNomeTributacao: 'fiscal_nome_tributacao',
  cest: 'fiscal_cest',
  origem: 'fiscal_origem',
  cfopEntrada: 'fiscal_cfop_entrada',
  cfopSaida: 'fiscal_cfop_saida',
  obsIcms: 'fiscal_obs_icms',
  obsPisCofins: 'fiscal_obs_pis_cofins',
  aliqIcms: null,
  aliqPis: null,
  aliqCofins: null,
  aliqIpi: null,
  aliqFcp: null,
};

const CATALOG_SECTION: Record<FiscalField, ProductSettingsCatalogSection> = {
  ncm: 'fiscal_ncm',
  fiscalSitTributaria: 'fiscal_sit_tributaria',
  fiscalNomeTributacao: 'fiscal_nome_tributacao',
  cest: 'fiscal_cest',
  origem: 'fiscal_origem',
  cfopEntrada: 'fiscal_cfop_entrada',
  cfopSaida: 'fiscal_cfop_saida',
  obsIcms: 'fiscal_obs_icms',
  obsPisCofins: 'fiscal_obs_pis_cofins',
  aliqIcms: 'fiscal_aliq_icms',
  aliqPis: 'fiscal_aliq_pis',
  aliqCofins: 'fiscal_aliq_cofins',
  aliqIpi: 'fiscal_aliq_ipi',
  aliqFcp: 'fiscal_aliq_fcp',
};

const LABEL: Record<FiscalField, string> = {
  ncm: 'NCM',
  fiscalSitTributaria: 'Situação Tributária',
  fiscalNomeTributacao: 'Nome da Tributação',
  cest: 'CEST',
  origem: 'Origem',
  cfopEntrada: 'CFOP Entrada',
  cfopSaida: 'CFOP Saída',
  obsIcms: 'Obs. ICMS',
  obsPisCofins: 'Obs. PIS/COFINS',
  aliqIcms: 'Alíq. ICMS',
  aliqPis: 'Alíq. PIS',
  aliqCofins: 'Alíq. COFINS',
  aliqIpi: 'Alíq. IPI',
  aliqFcp: 'Alíq. FCP',
};

function clean(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

async function hasFiscalValue(companyId: string, field: FiscalField, value: string) {
  const col = DB_COLUMN[field];
  const section = CATALOG_SECTION[field];

  if (col) {
    const real = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT 1
        FROM product_registry
        WHERE company_id = $1
          AND product_key NOT LIKE '__%placeholder__%'
          AND ${col} = $2
        LIMIT 1
      `,
      companyId,
      value,
    );
    if (real.length > 0) return true;
  }

  const catalog = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_settings_catalog
      WHERE company_id = $1
        AND section = $2
        AND value = $3
      LIMIT 1
    `,
    companyId,
    section,
    value,
  );
  return catalog.length > 0;
}

/**
 * POST /api/products/rename-fiscal
 * Actions:
 *   { action: 'add', field, name }      — add a new catalog value (without placeholders)
 *   { field, oldValue, newValue }       — rename (newValue: string) or delete (newValue: null)
 */
export async function POST(req: NextRequest) {
  let auth: { userId: string; role: string };
  try {
    auth = await requireEditor();
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const parsed = renameFiscalSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { action, field, oldValue, newValue, name } = parsed.data;

  const f = field as FiscalField;
  const company = await getOrCreateSingleCompany(auth.userId);
  await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);

  // --- Add new catalog value ---
  if (action === 'add') {
    const itemName = clean(name);
    if (!itemName) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    if (await hasFiscalValue(company.id, f, itemName)) {
      return NextResponse.json({ error: `${LABEL[f]} já existe` }, { status: 409 });
    }
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: CATALOG_SECTION[f],
      value: itemName,
    });
    return NextResponse.json({ created: true });
  }

  // --- Rename / delete ---
  const trimmedOld = clean(oldValue);
  if (!trimmedOld) {
    return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
  }
  const trimmedNew = newValue === null ? null : clean(newValue);
  if (newValue !== null && !trimmedNew) {
    return NextResponse.json({ error: 'newValue deve ser string não-vazia ou null' }, { status: 400 });
  }

  const col = DB_COLUMN[f];
  // catalog-only fields (numeric alíquotas) don't have a text column to update
  let updated = 0;
  if (col) {
    updated = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET ${col} = $1, updated_at = NOW() WHERE company_id = $2 AND ${col} = $3`,
      trimmedNew,
      company.id,
      trimmedOld,
    );
  }

  if (trimmedNew) {
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: CATALOG_SECTION[f],
      value: trimmedNew,
    });
  }

  await prisma.$executeRawUnsafe(
    `
      DELETE FROM product_settings_catalog
      WHERE company_id = $1
        AND section = $2
        AND value = $3
    `,
    company.id,
    CATALOG_SECTION[f],
    trimmedOld,
  );

  return NextResponse.json({ updated });
}
