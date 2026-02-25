import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

/**
 * POST /api/products/rename-type
 * Body: { field: 'productType'|'productSubtype', oldValue: string, newValue: string|null, parentType?: string }
 * Renames or clears a product type/subtype in bulk across all matching product_registry rows.
 */
export async function POST(req: NextRequest) {
  let auth: { userId: string; role: string };
  try {
    auth = await requireEditor();
  } catch {
    return unauthorizedResponse();
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Body inválido' }, { status: 400 });

  const { action, field, oldValue, newValue, parentType, name, subtypeName } = body as {
    action?: string;
    field?: string;
    oldValue?: string;
    newValue?: string | null;
    parentType?: string;
    name?: string;
    subtypeName?: string;
  };

  const company = await getOrCreateSingleCompany(auth.userId);
  await ensureProductRegistryTable();

  // --- Add new line or group ---
  if (action === 'addLine') {
    const lineName = name?.trim();
    if (!lineName) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    const pk = `__line_placeholder__${lineName}`;
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM product_registry WHERE company_id = $1 AND product_key = $2 LIMIT 1`, company.id, pk,
    );
    if (existing.length > 0) return NextResponse.json({ error: 'Linha já existe' }, { status: 409 });
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_registry (id, company_id, product_key, description, product_type, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
      `line_ph_${Date.now()}`, company.id, pk, `[Linha] ${lineName}`, lineName,
    );
    return NextResponse.json({ created: true });
  }

  if (action === 'addGroup') {
    const lineName = parentType?.trim();
    const grpName = subtypeName?.trim();
    if (!lineName || !grpName) return NextResponse.json({ error: 'parentType e subtypeName são obrigatórios' }, { status: 400 });
    const pk = `__group_placeholder__${lineName}__${grpName}`;
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM product_registry WHERE company_id = $1 AND product_key = $2 LIMIT 1`, company.id, pk,
    );
    if (existing.length > 0) return NextResponse.json({ error: 'Grupo já existe' }, { status: 409 });
    await prisma.$executeRawUnsafe(
      `INSERT INTO product_registry (id, company_id, product_key, description, product_type, product_subtype, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      `grp_ph_${Date.now()}`, company.id, pk, `[Grupo] ${lineName} - ${grpName}`, lineName, grpName,
    );
    return NextResponse.json({ created: true });
  }

  if (!field || !['productType', 'productSubtype'].includes(field)) {
    return NextResponse.json({ error: 'field deve ser productType ou productSubtype' }, { status: 400 });
  }
  if (typeof oldValue !== 'string' || oldValue.trim().length === 0) {
    return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
  }
  if (newValue !== null && (typeof newValue !== 'string' || newValue.trim().length === 0)) {
    return NextResponse.json({ error: 'newValue deve ser string não-vazia ou null' }, { status: 400 });
  }

  const dbColumn = field === 'productType' ? 'product_type' : 'product_subtype';
  const trimmedOld = oldValue.trim();
  const trimmedNew = newValue ? newValue.trim() : null;

  let query: string;
  let params: (string | null)[];

  if (field === 'productSubtype' && parentType) {
    query = `UPDATE product_registry SET ${dbColumn} = $1, updated_at = NOW() WHERE company_id = $2 AND ${dbColumn} = $3 AND product_type = $4`;
    params = [trimmedNew, company.id, trimmedOld, parentType];
  } else {
    query = `UPDATE product_registry SET ${dbColumn} = $1, updated_at = NOW() WHERE company_id = $2 AND ${dbColumn} = $3`;
    params = [trimmedNew, company.id, trimmedOld];
  }

  const updated: number = await prisma.$executeRawUnsafe(query, ...params);

  return NextResponse.json({ updated });
}
