import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  upsertProductSettingsCatalogEntry,
} from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';
import { apiValidationError } from '@/lib/api-error';
import { renameManufacturerSchema } from '@/lib/schemas/product';

function clean(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function isPlaceholderKey(productKey: string): boolean {
  return productKey.includes('placeholder');
}

async function hasManufacturer(companyId: string, manufacturerName: string) {
  const real = await prisma.productRegistry.findMany({
    where: { companyId, anvisaManufacturer: manufacturerName },
    select: { productKey: true },
    take: 50,
  });
  if (real.some((r) => !isPlaceholderKey(r.productKey))) return true;

  const catalog = await prisma.productSettingsCatalog.findFirst({
    where: { companyId, section: 'manufacturer', value: manufacturerName },
    select: { id: true },
  });
  return catalog != null;
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

  const parsed = renameManufacturerSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const { action, oldValue, newValue, manufacturer, shortName } = parsed.data;

  const company = await getOrCreateSingleCompany(auth.userId);
  await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);
  const now = new Date();

  if (action === 'rename') {
    const oldName = clean(oldValue);
    const nextName = clean(newValue);
    if (!oldName || !nextName) {
      return NextResponse.json({ error: 'oldValue e newValue são obrigatórios' }, { status: 400 });
    }

    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, anvisaManufacturer: oldName },
      data: { anvisaManufacturer: nextName, updatedAt: now },
    });

    const oldCatalog = await prisma.productSettingsCatalog.findFirst({
      where: { companyId: company.id, section: 'manufacturer', value: oldName },
      select: { extraValue: true },
    });

    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'manufacturer',
      value: nextName,
      extraValue: clean(oldCatalog?.extraValue) || null,
    });

    await prisma.productSettingsCatalog.deleteMany({
      where: { companyId: company.id, section: 'manufacturer', value: oldName },
    });

    return NextResponse.json({ updated: result.count });
  }

  if (action === 'delete') {
    const oldName = clean(oldValue);
    if (!oldName) {
      return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
    }
    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, anvisaManufacturer: oldName },
      data: {
        anvisaManufacturer: null,
        manufacturerShortName: null,
        updatedAt: now,
      },
    });

    await prisma.productSettingsCatalog.deleteMany({
      where: { companyId: company.id, section: 'manufacturer', value: oldName },
    });

    return NextResponse.json({ updated: result.count });
  }

  if (action === 'shortName') {
    const mfrName = clean(manufacturer);
    if (!mfrName) {
      return NextResponse.json({ error: 'manufacturer é obrigatório' }, { status: 400 });
    }
    const trimmedShort = clean(shortName);
    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, anvisaManufacturer: mfrName },
      data: { manufacturerShortName: trimmedShort, updatedAt: now },
    });

    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'manufacturer',
      value: mfrName,
      extraValue: trimmedShort,
    });

    return NextResponse.json({ updated: result.count });
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

  return NextResponse.json(
    { error: 'action deve ser rename, delete, shortName ou add' },
    { status: 400 },
  );
}
