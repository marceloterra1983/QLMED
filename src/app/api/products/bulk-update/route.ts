import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

function cleanString(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function normalizeAnvisa(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits.length === 11 ? digits : null;
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
    } catch (e: any) {
      if (e.message === 'FORBIDDEN') return forbiddenResponse();
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
      const description = cleanString(p.description) || cleanString(p.code) || key;

      // Values that change based on what fields were requested
      const productType  = 'productType'    in fields ? cleanString(fields.productType)    : null;
      const productSubtype = 'productSubtype' in fields ? cleanString(fields.productSubtype) : null;
      const ncm          = 'ncm'            in fields ? cleanString(fields.ncm)            : cleanString(p.ncm);
      const anvisaCode   = hasAnvisa ? anvisaVal : null;
      const anvisaSource = hasAnvisa && anvisaVal ? 'manual' : null;

      // Update SET clause — only fields that were requested
      const updates: string[] = ['updated_at = NOW()'];
      if ('productType'    in fields) updates.push('product_type = EXCLUDED.product_type');
      if ('productSubtype' in fields) updates.push('product_subtype = EXCLUDED.product_subtype');
      if ('ncm'            in fields) updates.push('ncm = EXCLUDED.ncm');
      if ('shortName'      in fields) updates.push('short_name = EXCLUDED.short_name');
      if ('outOfLine'      in fields) updates.push('out_of_line = EXCLUDED.out_of_line');
      if (hasAnvisa) {
        updates.push('anvisa_code = EXCLUDED.anvisa_code');
        if (anvisaVal) updates.push('anvisa_source = EXCLUDED.anvisa_source');
      }

      await prisma.$executeRawUnsafe(
        `INSERT INTO product_registry
           (id, company_id, product_key, code, description, ncm, unit, ean,
            product_type, product_subtype, short_name, anvisa_code, anvisa_source,
            out_of_line,
            created_at, updated_at)
         VALUES
           (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7,
            $8, $9, $10, $11, $12,
            $13,
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
        'shortName'      in fields ? cleanString(fields.shortName)      : null,
        hasAnvisa ? anvisaVal : null,
        hasAnvisa && anvisaVal ? 'manual' : null,
        'outOfLine' in fields ? (fields.outOfLine === true) : false,
      );

      updated++;
    }

    return NextResponse.json({ updated });
  } catch (e: any) {
    if (e.message === 'ANVISA_INVALID') {
      return NextResponse.json({ error: 'Código ANVISA inválido. Informe exatamente 11 dígitos.' }, { status: 400 });
    }
    console.error('bulk-update error', e);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}
