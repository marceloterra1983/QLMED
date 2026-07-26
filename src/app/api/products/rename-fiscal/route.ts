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

const VALID_FIELDS = [
  'ncm',
  'fiscalSitTributaria',
  'fiscalNomeTributacao',
  'cest',
  'origem',
  'cfopEntrada',
  'cfopSaida',
  'obsIcms',
  'obsPisCofins',
  'aliqIcms',
  'aliqPis',
  'aliqCofins',
  'aliqIpi',
  'aliqFcp',
] as const;
type FiscalField = (typeof VALID_FIELDS)[number];

/** Prisma ProductRegistry field for text renames; null = catalog-only (alíquotas). */
const PRISMA_FIELD: Record<FiscalField, string | null> = {
  ncm: 'ncm',
  fiscalSitTributaria: 'fiscalSitTributaria',
  fiscalNomeTributacao: 'fiscalNomeTributacao',
  cest: 'fiscalCest',
  origem: 'fiscalOrigem',
  cfopEntrada: 'fiscalCfopEntrada',
  cfopSaida: 'fiscalCfopSaida',
  obsIcms: 'fiscalObsIcms',
  obsPisCofins: 'fiscalObsPisCofins',
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

function isPlaceholderKey(productKey: string): boolean {
  return productKey.includes('placeholder');
}

async function hasFiscalValue(companyId: string, field: FiscalField, value: string) {
  const prismaField = PRISMA_FIELD[field];
  const section = CATALOG_SECTION[field];

  if (prismaField) {
    const rows = await prisma.productRegistry.findMany({
      where: {
        companyId,
        [prismaField]: value,
      },
      select: { productKey: true },
      take: 50,
    });
    if (rows.some((r) => !isPlaceholderKey(r.productKey))) return true;
  }

  const catalog = await prisma.productSettingsCatalog.findFirst({
    where: { companyId, section, value },
    select: { id: true },
  });
  return catalog != null;
}

/**
 * POST /api/products/rename-fiscal
 * Actions:
 *   { action: 'add', field, name }      — add a new catalog value
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

  const trimmedOld = clean(oldValue);
  if (!trimmedOld) {
    return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
  }
  const trimmedNew = newValue === null ? null : clean(newValue);
  if (newValue !== null && !trimmedNew) {
    return NextResponse.json({ error: 'newValue deve ser string não-vazia ou null' }, { status: 400 });
  }

  const prismaField = PRISMA_FIELD[f];
  let updated = 0;
  if (prismaField) {
    const result = await prisma.productRegistry.updateMany({
      where: {
        companyId: company.id,
        [prismaField]: trimmedOld,
      },
      data: {
        [prismaField]: trimmedNew,
        updatedAt: new Date(),
      },
    });
    updated = result.count;
  }

  if (trimmedNew) {
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: CATALOG_SECTION[f],
      value: trimmedNew,
    });
  }

  await prisma.productSettingsCatalog.deleteMany({
    where: {
      companyId: company.id,
      section: CATALOG_SECTION[f],
      value: trimmedOld,
    },
  });

  return NextResponse.json({ updated });
}
