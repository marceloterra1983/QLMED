import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  upsertProductSettingsCatalogEntry,
} from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';

function clean(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

async function hasManufacturer(companyId: string, manufacturerName: string) {
  const real = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_registry
      WHERE company_id = $1
        AND product_key NOT LIKE '__%placeholder__%'
        AND anvisa_manufacturer = $2
      LIMIT 1
    `,
    companyId,
    manufacturerName,
  );
  if (real.length > 0) return true;

  const catalog = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_settings_catalog
      WHERE company_id = $1
        AND section = 'manufacturer'
        AND value = $2
      LIMIT 1
    `,
    companyId,
    manufacturerName,
  );
  return catalog.length > 0;
}

/**
 * POST /api/products/rename-manufacturer
 * Actions:
 *   rename:     { action: 'rename', oldValue: string, newValue: string }
 *   delete:     { action: 'delete', oldValue: string }
 *   shortName:  { action: 'shortName', manufacturer: string, shortName: string|null }
 *   add:        { action: 'add', name: string, shortName?: string|null }
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

  const { action, oldValue, newValue, manufacturer, shortName } = body as {
    action?: string;
    oldValue?: string;
    newValue?: string;
    manufacturer?: string;
    shortName?: string | null;
  };

  const company = await getOrCreateSingleCompany(auth.userId);
  await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);

  if (action === 'rename') {
    const oldName = clean(oldValue);
    const nextName = clean(newValue);
    if (!oldName || !nextName) {
      return NextResponse.json({ error: 'oldValue e newValue são obrigatórios' }, { status: 400 });
    }

    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET anvisa_manufacturer = $1, updated_at = NOW() WHERE company_id = $2 AND anvisa_manufacturer = $3`,
      nextName,
      company.id,
      oldName,
    );

    const oldCatalog = await prisma.$queryRawUnsafe<any[]>(
      `
        SELECT extra_value
        FROM product_settings_catalog
        WHERE company_id = $1
          AND section = 'manufacturer'
          AND value = $2
        LIMIT 1
      `,
      company.id,
      oldName,
    );

    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'manufacturer',
      value: nextName,
      extraValue: clean(oldCatalog[0]?.extra_value) || null,
    });

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM product_settings_catalog
        WHERE company_id = $1
          AND section = 'manufacturer'
          AND value = $2
      `,
      company.id,
      oldName,
    );

    return NextResponse.json({ updated });
  }

  if (action === 'delete') {
    const oldName = clean(oldValue);
    if (!oldName) {
      return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
    }
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET anvisa_manufacturer = NULL, manufacturer_short_name = NULL, updated_at = NOW() WHERE company_id = $1 AND anvisa_manufacturer = $2`,
      company.id,
      oldName,
    );

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM product_settings_catalog
        WHERE company_id = $1
          AND section = 'manufacturer'
          AND value = $2
      `,
      company.id,
      oldName,
    );

    return NextResponse.json({ updated });
  }

  if (action === 'shortName') {
    const mfrName = clean(manufacturer);
    if (!mfrName) {
      return NextResponse.json({ error: 'manufacturer é obrigatório' }, { status: 400 });
    }
    const trimmedShort = clean(shortName);
    const updated: number = await prisma.$executeRawUnsafe(
      `UPDATE product_registry SET manufacturer_short_name = $1, updated_at = NOW() WHERE company_id = $2 AND anvisa_manufacturer = $3`,
      trimmedShort,
      company.id,
      mfrName,
    );

    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'manufacturer',
      value: mfrName,
      extraValue: trimmedShort,
    });

    return NextResponse.json({ updated });
  }

  if (action === 'add') {
    const name = clean(body.name as string | undefined);
    const short = clean(body.shortName as string | undefined) || null;
    if (!name) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    }
    if (await hasManufacturer(company.id, name)) {
      return NextResponse.json({ error: 'Fabricante já existe' }, { status: 409 });
    }

    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'manufacturer',
      value: name,
      extraValue: short,
    });
    return NextResponse.json({ created: true });
  }

  return NextResponse.json({ error: 'action deve ser rename, delete, shortName ou add' }, { status: 400 });
}
