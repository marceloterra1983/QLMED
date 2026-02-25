import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import prisma from '@/lib/prisma';

/**
 * POST /api/products/rename-manufacturer
 * Actions:
 *   rename:     { action: 'rename', oldValue: string, newValue: string }
 *   delete:     { action: 'delete', oldValue: string }
 *   shortName:  { action: 'shortName', manufacturer: string, shortName: string|null }
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

  const { action, oldValue, newValue, manufacturer, shortName } = body as {
    action?: string;
    oldValue?: string;
    newValue?: string;
    manufacturer?: string;
    shortName?: string | null;
  };

  const company = await getOrCreateSingleCompany(auth.userId);
  await ensureProductRegistryTable();

  if (action === 'rename') {
    if (!oldValue?.trim() || !newValue?.trim()) {
      return NextResponse.json({ error: 'oldValue e newValue são obrigatórios' }, { status: 400 });
    }
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET anvisa_manufacturer = $1, updated_at = NOW() WHERE company_id = $2 AND anvisa_manufacturer = $3`,
      newValue.trim(), company.id, oldValue.trim(),
    );
    return NextResponse.json({ updated });
  }

  if (action === 'delete') {
    if (!oldValue?.trim()) {
      return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
    }
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET anvisa_manufacturer = NULL, manufacturer_short_name = NULL, updated_at = NOW() WHERE company_id = $1 AND anvisa_manufacturer = $2`,
      company.id, oldValue.trim(),
    );
    return NextResponse.json({ updated });
  }

  if (action === 'shortName') {
    if (!manufacturer?.trim()) {
      return NextResponse.json({ error: 'manufacturer é obrigatório' }, { status: 400 });
    }
    const trimmedShort = shortName?.trim() || null;
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET manufacturer_short_name = $1, updated_at = NOW() WHERE company_id = $2 AND anvisa_manufacturer = $3`,
      trimmedShort, company.id, manufacturer.trim(),
    );
    return NextResponse.json({ updated });
  }

  if (action === 'add') {
    const name = (body.name as string)?.trim();
    const short = (body.shortName as string)?.trim() || null;
    if (!name) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    }
    // Insert a placeholder row so the manufacturer appears in listings.
    // Uses a synthetic product_key to avoid collisions.
    const id = `mfr_placeholder_${Date.now()}`;
    const productKey = `__manufacturer_placeholder__${name}`;

    // Check if placeholder already exists
    const existing = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id FROM product_registry WHERE company_id = $1 AND product_key = $2 LIMIT 1`,
      company.id, productKey,
    );
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Fabricante já existe' }, { status: 409 });
    }

    await prisma.$executeRawUnsafe(
      `INSERT INTO product_registry (id, company_id, product_key, description, anvisa_manufacturer, manufacturer_short_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())`,
      id, company.id, productKey, `[Fabricante] ${name}`, name, short,
    );
    return NextResponse.json({ created: true });
  }

  return NextResponse.json({ error: 'action deve ser rename, delete, shortName ou add' }, { status: 400 });
}
