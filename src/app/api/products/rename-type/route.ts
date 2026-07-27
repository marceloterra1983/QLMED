import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { toCatalogKey, upsertProductSettingsCatalogEntry } from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';
import { apiValidationError } from '@/lib/api-error';
import { renameTypeSchema } from '@/lib/schemas/product';

function clean(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

function isPlaceholderKey(productKey: string): boolean {
  return productKey.includes('placeholder');
}

async function hasLine(companyId: string, lineName: string) {
  const real = await prisma.productRegistry.findMany({
    where: { companyId, productType: lineName },
    select: { productKey: true },
    take: 50,
  });
  if (real.some((r) => !isPlaceholderKey(r.productKey))) return true;

  const catalog = await prisma.productSettingsCatalog.findFirst({
    where: { companyId, section: 'line', value: lineName },
    select: { id: true },
  });
  return catalog != null;
}

async function hasGroup(companyId: string, parentType: string, groupName: string) {
  const real = await prisma.productRegistry.findMany({
    where: { companyId, productType: parentType, productSubtype: groupName },
    select: { productKey: true },
    take: 50,
  });
  if (real.some((r) => !isPlaceholderKey(r.productKey))) return true;

  const catalog = await prisma.productSettingsCatalog.findFirst({
    where: {
      companyId,
      section: 'group',
      value: groupName,
      parentValueKey: toCatalogKey(parentType),
    },
    select: { id: true },
  });
  return catalog != null;
}

async function hasSubgroup(
  companyId: string,
  parentType: string,
  parentSubtype: string,
  subgroupName: string,
) {
  const real = await prisma.productRegistry.findMany({
    where: {
      companyId,
      productType: parentType,
      productSubtype: parentSubtype,
      productSubgroup: subgroupName,
    },
    select: { productKey: true },
    take: 50,
  });
  if (real.some((r) => !isPlaceholderKey(r.productKey))) return true;

  const catalog = await prisma.productSettingsCatalog.findFirst({
    where: {
      companyId,
      section: 'subgroup',
      value: subgroupName,
      parentValueKey: toCatalogKey(parentType),
      parentSecondaryValueKey: toCatalogKey(parentSubtype),
    },
    select: { id: true },
  });
  return catalog != null;
}

async function reparentCatalogEntries(input: {
  companyId: string;
  section: 'group' | 'subgroup';
  oldParentValueKey: string;
  newParentValue: string;
  newParentValueKey: string;
  /** When set, reparent secondary parent (subtype rename affecting subgroups) */
  secondary?: {
    oldKey: string;
    newValue: string;
    newKey: string;
  };
}) {
  const { companyId, section, oldParentValueKey, newParentValue, newParentValueKey, secondary } =
    input;

  const where = secondary
    ? {
        companyId,
        section,
        parentValueKey: oldParentValueKey,
        parentSecondaryValueKey: secondary.oldKey,
      }
    : {
        companyId,
        section,
        parentValueKey: oldParentValueKey,
      };

  const oldEntries = await prisma.productSettingsCatalog.findMany({ where });

  for (const entry of oldEntries) {
    const nextParentKey = secondary ? entry.parentValueKey : newParentValueKey;
    const nextSecondaryKey = secondary ? secondary.newKey : entry.parentSecondaryValueKey;

    const conflict = await prisma.productSettingsCatalog.findFirst({
      where: {
        companyId,
        section,
        value: entry.value,
        parentValueKey: nextParentKey,
        parentSecondaryValueKey: nextSecondaryKey,
        NOT: { id: entry.id },
      },
      select: { id: true },
    });

    if (conflict) {
      await prisma.productSettingsCatalog.delete({ where: { id: entry.id } });
      continue;
    }

    await prisma.productSettingsCatalog.update({
      where: { id: entry.id },
      data: secondary
        ? {
            parentSecondaryValue: secondary.newValue,
            parentSecondaryValueKey: secondary.newKey,
            updatedAt: new Date(),
          }
        : {
            parentValue: newParentValue,
            parentValueKey: newParentValueKey,
            updatedAt: new Date(),
          },
    });
  }
}

async function syncCatalogAfterTypeChange(input: {
  companyId: string;
  field: 'productType' | 'productSubtype' | 'productSubgroup';
  oldValue: string;
  newValue: string | null;
  parentType?: string;
  parentSubtype?: string;
}) {
  const { companyId, field, oldValue, newValue } = input;
  const parentType = clean(input.parentType);
  const parentSubtype = clean(input.parentSubtype);
  const oldKey = toCatalogKey(oldValue);
  const newKey = toCatalogKey(newValue);

  if (field === 'productType') {
    if (newValue) {
      await upsertProductSettingsCatalogEntry({
        companyId,
        section: 'line',
        value: newValue,
      });
    }

    await prisma.productSettingsCatalog.deleteMany({
      where: { companyId, section: 'line', value: oldValue },
    });

    if (!newValue) {
      await prisma.productSettingsCatalog.deleteMany({
        where: {
          companyId,
          section: { in: ['group', 'subgroup'] },
          parentValueKey: oldKey,
        },
      });
      return;
    }

    for (const section of ['group', 'subgroup'] as const) {
      await reparentCatalogEntries({
        companyId,
        section,
        oldParentValueKey: oldKey,
        newParentValue: newValue,
        newParentValueKey: newKey,
      });
    }
    return;
  }

  if (field === 'productSubtype') {
    if (parentType && newValue) {
      await upsertProductSettingsCatalogEntry({
        companyId,
        section: 'group',
        value: newValue,
        parentValue: parentType,
      });
    }

    await prisma.productSettingsCatalog.deleteMany({
      where: {
        companyId,
        section: 'group',
        value: oldValue,
        ...(parentType ? { parentValueKey: toCatalogKey(parentType) } : {}),
      },
    });

    if (!parentType) return;

    if (!newValue) {
      await prisma.productSettingsCatalog.deleteMany({
        where: {
          companyId,
          section: 'subgroup',
          parentValueKey: toCatalogKey(parentType),
          parentSecondaryValueKey: oldKey,
        },
      });
      return;
    }

    await reparentCatalogEntries({
      companyId,
      section: 'subgroup',
      oldParentValueKey: toCatalogKey(parentType),
      newParentValue: parentType,
      newParentValueKey: toCatalogKey(parentType),
      secondary: {
        oldKey,
        newValue,
        newKey,
      },
    });
    return;
  }

  if (field === 'productSubgroup') {
    if (parentType && parentSubtype && newValue) {
      await upsertProductSettingsCatalogEntry({
        companyId,
        section: 'subgroup',
        value: newValue,
        parentValue: parentType,
        parentSecondaryValue: parentSubtype,
      });
    }

    if (parentType && parentSubtype) {
      await prisma.productSettingsCatalog.deleteMany({
        where: {
          companyId,
          section: 'subgroup',
          value: oldValue,
          parentValueKey: toCatalogKey(parentType),
          parentSecondaryValueKey: toCatalogKey(parentSubtype),
        },
      });
    } else {
      await prisma.productSettingsCatalog.deleteMany({
        where: { companyId, section: 'subgroup', value: oldValue },
      });
    }
  }
}

/**
 * POST /api/products/rename-type
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

  const parsed = renameTypeSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  const {
    action,
    field,
    oldValue,
    newValue,
    parentType,
    parentSubtype,
    name,
    subtypeName,
    subgroupName,
  } = parsed.data;

  const company = await getOrCreateSingleCompany(auth.userId);

  if (action === 'addLine') {
    const lineName = clean(name);
    if (!lineName) return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 });
    if (await hasLine(company.id, lineName)) {
      return NextResponse.json({ error: 'Linha já existe' }, { status: 409 });
    }
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'line',
      value: lineName,
    });
    return NextResponse.json({ created: true });
  }

  if (action === 'addGroup') {
    const lineName = clean(parentType);
    const groupName = clean(subtypeName);
    if (!lineName || !groupName) {
      return NextResponse.json(
        { error: 'parentType e subtypeName são obrigatórios' },
        { status: 400 },
      );
    }
    if (await hasGroup(company.id, lineName, groupName)) {
      return NextResponse.json({ error: 'Grupo já existe' }, { status: 409 });
    }
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'line',
      value: lineName,
    });
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'group',
      value: groupName,
      parentValue: lineName,
    });
    return NextResponse.json({ created: true });
  }

  if (action === 'addSubgroup') {
    const lineName = clean(parentType);
    const groupName = clean(parentSubtype);
    const sgName = clean(subgroupName);
    if (!lineName || !groupName || !sgName) {
      return NextResponse.json(
        { error: 'parentType, parentSubtype e subgroupName são obrigatórios' },
        { status: 400 },
      );
    }
    if (await hasSubgroup(company.id, lineName, groupName, sgName)) {
      return NextResponse.json({ error: 'Subgrupo já existe' }, { status: 409 });
    }
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'line',
      value: lineName,
    });
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'group',
      value: groupName,
      parentValue: lineName,
    });
    await upsertProductSettingsCatalogEntry({
      companyId: company.id,
      section: 'subgroup',
      value: sgName,
      parentValue: lineName,
      parentSecondaryValue: groupName,
    });
    return NextResponse.json({ created: true });
  }

  if (!field || !['productType', 'productSubtype', 'productSubgroup'].includes(field)) {
    return NextResponse.json(
      { error: 'field deve ser productType, productSubtype ou productSubgroup' },
      { status: 400 },
    );
  }
  if (typeof oldValue !== 'string' || oldValue.trim().length === 0) {
    return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
  }
  if (newValue !== null && (typeof newValue !== 'string' || newValue.trim().length === 0)) {
    return NextResponse.json(
      { error: 'newValue deve ser string não-vazia ou null' },
      { status: 400 },
    );
  }

  const typedField = field as 'productType' | 'productSubtype' | 'productSubgroup';
  const trimmedOld = oldValue.trim();
  const trimmedNew = newValue ? newValue.trim() : null;
  const trimmedParentType = clean(parentType);
  const trimmedParentSubtype = clean(parentSubtype);
  const now = new Date();

  let updated = 0;

  if (typedField === 'productSubgroup' && trimmedParentType && trimmedParentSubtype) {
    const result = await prisma.productRegistry.updateMany({
      where: {
        companyId: company.id,
        productSubgroup: trimmedOld,
        productType: trimmedParentType,
        productSubtype: trimmedParentSubtype,
      },
      data: { productSubgroup: trimmedNew, updatedAt: now },
    });
    updated = result.count;
  } else if (typedField === 'productSubtype' && trimmedParentType) {
    const result = await prisma.productRegistry.updateMany({
      where: {
        companyId: company.id,
        productSubtype: trimmedOld,
        productType: trimmedParentType,
      },
      data: { productSubtype: trimmedNew, updatedAt: now },
    });
    updated = result.count;
  } else if (typedField === 'productType') {
    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, productType: trimmedOld },
      data: { productType: trimmedNew, updatedAt: now },
    });
    updated = result.count;
  } else if (typedField === 'productSubtype') {
    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, productSubtype: trimmedOld },
      data: { productSubtype: trimmedNew, updatedAt: now },
    });
    updated = result.count;
  } else {
    const result = await prisma.productRegistry.updateMany({
      where: { companyId: company.id, productSubgroup: trimmedOld },
      data: { productSubgroup: trimmedNew, updatedAt: now },
    });
    updated = result.count;
  }

  await syncCatalogAfterTypeChange({
    companyId: company.id,
    field: typedField,
    oldValue: trimmedOld,
    newValue: trimmedNew,
    parentType: trimmedParentType || undefined,
    parentSubtype: trimmedParentSubtype || undefined,
  });

  return NextResponse.json({ updated });
}
