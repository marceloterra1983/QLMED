import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';
import { cleanString } from '@/lib/utils';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('products/bulk-update');

function normalizeAnvisa(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

interface ProductItem {
  productKey: string;
  code?: string | null;
  description?: string | null;
  ncm?: string | null;
  unit?: string | null;
  ean?: string | null;
}

/**
 * PATCH /api/products/bulk-update
 * Body: { products: ProductItem[], fields: { productType?, productSubtype?, ncm?, anvisa? } }
 * Only keys present in `fields` are updated.
 */
export async function PATCH(req: Request) {
  try {
    let userId: string;
    try {
      const auth = await requireEditor();
      userId = auth.userId;
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const body = await req.json().catch(() => null);

    const products: ProductItem[] = Array.isArray(body?.products) ? body.products : [];
    const fields: Record<string, unknown> = typeof body?.fields === 'object' && body.fields ? body.fields : {};

    if (products.length === 0) return NextResponse.json({ error: 'products é obrigatório' }, { status: 400 });
    if (products.length > 500) return NextResponse.json({ error: 'Máximo de 500 produtos' }, { status: 400 });
    if (Object.keys(fields).length === 0) return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 });

    const hasAnvisa = 'anvisa' in fields;
    const anvisaVal: string | null = hasAnvisa
      ? (fields.anvisa === null || fields.anvisa === '' ? null : (() => {
          const n = normalizeAnvisa(fields.anvisa);
          if (!n) throw new Error('ANVISA_INVALID');
          return n;
        })())
      : null;

    await ensureProductRegistryTable();

    let updated = 0;

    for (const p of products) {
      const key = cleanString(p.productKey);
      if (!key) continue;

      // Build the upsert: INSERT with all fields, ON CONFLICT update only the requested fields
      const description = ('description' in fields ? cleanString(fields.description) : null) || cleanString(p.description) || cleanString(p.code) || key;

      // Values that change based on what fields were requested
      const productType  = 'productType'    in fields ? cleanString(fields.productType)    : null;
      const productSubtype = 'productSubtype' in fields ? cleanString(fields.productSubtype) : null;
      const productSubgroup = 'productSubgroup' in fields ? cleanString(fields.productSubgroup) : null;
      const ncm          = 'ncm'            in fields ? cleanString(fields.ncm)            : cleanString(p.ncm);
      const anvisaCode   = hasAnvisa ? anvisaVal : null;
      const anvisaSource = hasAnvisa && anvisaVal ? 'manual' : null;

      // Update SET clause — only fields that were requested
      const updates: string[] = ['updated_at = NOW()'];
      if ('description'    in fields) updates.push('description = EXCLUDED.description');
      if ('productType'    in fields) updates.push('product_type = EXCLUDED.product_type');
      if ('productSubtype' in fields) updates.push('product_subtype = EXCLUDED.product_subtype');
      if ('productSubgroup' in fields) updates.push('product_subgroup = EXCLUDED.product_subgroup');
      if ('ncm'            in fields) updates.push('ncm = EXCLUDED.ncm');
      if ('shortName'      in fields) updates.push('short_name = EXCLUDED.short_name');
      if ('outOfLine'      in fields) updates.push('out_of_line = EXCLUDED.out_of_line');
      if ('instrumental'   in fields) updates.push('instrumental = EXCLUDED.instrumental');
      if (hasAnvisa) {
        updates.push('anvisa_code = EXCLUDED.anvisa_code');
        if (anvisaVal) updates.push('anvisa_source = EXCLUDED.anvisa_source');
      }
      if ('fiscalSitTributaria'  in fields) updates.push('fiscal_sit_tributaria = EXCLUDED.fiscal_sit_tributaria');
      if ('fiscalNomeTributacao' in fields) updates.push('fiscal_nome_tributacao = EXCLUDED.fiscal_nome_tributacao');
      if ('fiscalIcms'           in fields) updates.push('fiscal_icms = EXCLUDED.fiscal_icms');
      if ('fiscalPis'            in fields) updates.push('fiscal_pis = EXCLUDED.fiscal_pis');
      if ('fiscalCofins'         in fields) updates.push('fiscal_cofins = EXCLUDED.fiscal_cofins');
      if ('fiscalObs'            in fields) updates.push('fiscal_obs = EXCLUDED.fiscal_obs');
      if ('fiscalCest'           in fields) updates.push('fiscal_cest = EXCLUDED.fiscal_cest');
      if ('fiscalOrigem'         in fields) updates.push('fiscal_origem = EXCLUDED.fiscal_origem');
      if ('fiscalCfopEntrada'    in fields) updates.push('fiscal_cfop_entrada = EXCLUDED.fiscal_cfop_entrada');
      if ('fiscalCfopSaida'      in fields) updates.push('fiscal_cfop_saida = EXCLUDED.fiscal_cfop_saida');
      if ('fiscalIpi'            in fields) updates.push('fiscal_ipi = EXCLUDED.fiscal_ipi');
      if ('fiscalFcp'            in fields) updates.push('fiscal_fcp = EXCLUDED.fiscal_fcp');
      if ('fiscalCstIpi'         in fields) updates.push('fiscal_cst_ipi = EXCLUDED.fiscal_cst_ipi');
      if ('fiscalCstPis'         in fields) updates.push('fiscal_cst_pis = EXCLUDED.fiscal_cst_pis');
      if ('fiscalCstCofins'      in fields) updates.push('fiscal_cst_cofins = EXCLUDED.fiscal_cst_cofins');
      if ('fiscalObsIcms'        in fields) updates.push('fiscal_obs_icms = EXCLUDED.fiscal_obs_icms');
      if ('fiscalObsPisCofins'   in fields) updates.push('fiscal_obs_pis_cofins = EXCLUDED.fiscal_obs_pis_cofins');
      if ('productRefs'            in fields) updates.push('product_refs = EXCLUDED.product_refs');
      if ('manufacturerShortName' in fields) updates.push('manufacturer_short_name = EXCLUDED.manufacturer_short_name');
      if ('defaultSupplier'       in fields) updates.push('default_supplier = EXCLUDED.default_supplier');

      await prisma.$executeRawUnsafe(
        `INSERT INTO product_registry
           (id, company_id, product_key, code, description, ncm, unit, ean,
            product_type, product_subtype, product_subgroup, short_name, anvisa_code, anvisa_source,
            out_of_line, instrumental,
            fiscal_sit_tributaria, fiscal_nome_tributacao, fiscal_icms, fiscal_pis, fiscal_cofins, fiscal_obs,
            fiscal_cest, fiscal_origem, fiscal_cfop_entrada, fiscal_cfop_saida, fiscal_ipi, fiscal_fcp,
            fiscal_cst_ipi, fiscal_cst_pis, fiscal_cst_cofins,
            fiscal_obs_icms, fiscal_obs_pis_cofins,
            product_refs,
            manufacturer_short_name,
            default_supplier,
            codigo,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12, $13,
            $14, $34,
            $15, $16, $17, $18, $19, $20,
            $21, $22, $23, $24, $25, $26,
            $27, $28, $29,
            $30, $31,
            $32::text[],
            $33,
            $35,
            (SELECT LPAD((COALESCE(MAX(CAST(NULLIF(REGEXP_REPLACE(codigo, '[^0-9]', '', 'g'), '') AS BIGINT)), 0) + 1)::TEXT, 5, '0') FROM product_registry WHERE company_id = $1),
            NOW(), NOW())
         ON CONFLICT (company_id, product_key) DO UPDATE SET
           ${updates.join(',\n           ')}`,
        company.id,
        key,
        cleanString(p.code),
        description,
        'ncm' in fields ? cleanString(fields.ncm) : cleanString(p.ncm),
        cleanString(p.unit),
        cleanString(p.ean),
        'productType'    in fields ? cleanString(fields.productType)    : null,
        'productSubtype' in fields ? cleanString(fields.productSubtype) : null,
        'productSubgroup' in fields ? cleanString(fields.productSubgroup) : null,
        'shortName'      in fields ? cleanString(fields.shortName)      : null,
        hasAnvisa ? anvisaVal : null,
        hasAnvisa && anvisaVal ? 'manual' : null,
        'outOfLine' in fields ? (fields.outOfLine === true) : false,
        'fiscalSitTributaria'  in fields ? cleanString(fields.fiscalSitTributaria)  : null,
        'fiscalNomeTributacao' in fields ? cleanString(fields.fiscalNomeTributacao) : null,
        'fiscalIcms'           in fields ? toNullableNumber(fields.fiscalIcms)      : null,
        'fiscalPis'            in fields ? toNullableNumber(fields.fiscalPis)        : null,
        'fiscalCofins'         in fields ? toNullableNumber(fields.fiscalCofins)     : null,
        'fiscalObs'            in fields ? cleanString(fields.fiscalObs)             : null,
        'fiscalCest'           in fields ? cleanString(fields.fiscalCest)            : null,
        'fiscalOrigem'         in fields ? cleanString(fields.fiscalOrigem)          : null,
        'fiscalCfopEntrada'    in fields ? cleanString(fields.fiscalCfopEntrada)     : null,
        'fiscalCfopSaida'      in fields ? cleanString(fields.fiscalCfopSaida)       : null,
        'fiscalIpi'            in fields ? toNullableNumber(fields.fiscalIpi)         : null,
        'fiscalFcp'            in fields ? toNullableNumber(fields.fiscalFcp)         : null,
        'fiscalCstIpi'         in fields ? cleanString(fields.fiscalCstIpi)           : null,
        'fiscalCstPis'         in fields ? cleanString(fields.fiscalCstPis)           : null,
        'fiscalCstCofins'      in fields ? cleanString(fields.fiscalCstCofins)        : null,
        'fiscalObsIcms'        in fields ? cleanString(fields.fiscalObsIcms)          : null,
        'fiscalObsPisCofins'   in fields ? cleanString(fields.fiscalObsPisCofins)     : null,
        'productRefs'            in fields ? (Array.isArray(fields.productRefs) ? fields.productRefs : []) : [],
        'manufacturerShortName'  in fields ? cleanString(fields.manufacturerShortName) : null,
        'instrumental'           in fields ? (fields.instrumental === true) : false,
        'defaultSupplier'        in fields ? cleanString(fields.defaultSupplier)        : null,
      );

      updated++;
    }

    return NextResponse.json({ updated });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'ANVISA_INVALID') {
      return NextResponse.json({ error: 'Código ANVISA inválido. Informe exatamente 11 dígitos.' }, { status: 400 });
    }
    return apiError(e, 'POST /api/products/bulk-update');
  }
}
