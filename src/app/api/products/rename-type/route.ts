import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { ensureProductRegistryTable } from '@/lib/product-registry-store';
import {
  ensureProductSettingsCatalogTable,
  toCatalogKey,
  upsertProductSettingsCatalogEntry,
} from '@/lib/product-settings-catalog';
import prisma from '@/lib/prisma';

function clean(value: string | null | undefined): string | null {
  const normalized = (value || '').trim();
  return normalized.length > 0 ? normalized : null;
}

async function hasLine(companyId: string, lineName: string) {
  const real = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_registry
      WHERE company_id = $1
        AND product_key NOT LIKE '__%placeholder__%'
        AND product_type = $2
      LIMIT 1
    `,
    companyId,
    lineName,
  );
  if (real.length > 0) return true;

  const catalog = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_settings_catalog
      WHERE company_id = $1
        AND section = 'line'
        AND value = $2
      LIMIT 1
    `,
    companyId,
    lineName,
  );
  return catalog.length > 0;
}

async function hasGroup(companyId: string, parentType: string, groupName: string) {
  const real = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_registry
      WHERE company_id = $1
        AND product_key NOT LIKE '__%placeholder__%'
        AND product_type = $2
        AND product_subtype = $3
      LIMIT 1
    `,
    companyId,
    parentType,
    groupName,
  );
  if (real.length > 0) return true;

  const catalog = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_settings_catalog
      WHERE company_id = $1
        AND section = 'group'
        AND value = $2
        AND parent_value_key = $3
      LIMIT 1
    `,
    companyId,
    groupName,
    toCatalogKey(parentType),
  );
  return catalog.length > 0;
}

async function hasSubgroup(
  companyId: string,
  parentType: string,
  parentSubtype: string,
  subgroupName: string,
) {
  const real = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_registry
      WHERE company_id = $1
        AND product_key NOT LIKE '__%placeholder__%'
        AND product_type = $2
        AND product_subtype = $3
        AND product_subgroup = $4
      LIMIT 1
    `,
    companyId,
    parentType,
    parentSubtype,
    subgroupName,
  );
  if (real.length > 0) return true;

  const catalog = await prisma.$queryRawUnsafe<any[]>(
    `
      SELECT 1
      FROM product_settings_catalog
      WHERE company_id = $1
        AND section = 'subgroup'
        AND value = $2
        AND parent_value_key = $3
        AND parent_secondary_value_key = $4
      LIMIT 1
    `,
    companyId,
    subgroupName,
    toCatalogKey(parentType),
    toCatalogKey(parentSubtype),
  );
  return catalog.length > 0;
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

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM product_settings_catalog
        WHERE company_id = $1
          AND section = 'line'
          AND value = $2
      `,
      companyId,
      oldValue,
    );

    if (!newValue) {
      await prisma.$executeRawUnsafe(
        `
          DELETE FROM product_settings_catalog
          WHERE company_id = $1
            AND section IN ('group', 'subgroup')
            AND parent_value_key = $2
        `,
        companyId,
        oldKey,
      );
      return;
    }

    for (const section of ['group', 'subgroup'] as const) {
      await prisma.$executeRawUnsafe(
        `
          DELETE FROM product_settings_catalog old
          USING product_settings_catalog existing
          WHERE old.company_id = $1
            AND old.section = $2
            AND old.parent_value_key = $3
            AND existing.company_id = old.company_id
            AND existing.section = old.section
            AND existing.value = old.value
            AND existing.parent_value_key = $4
            AND existing.parent_secondary_value_key = old.parent_secondary_value_key
        `,
        companyId,
        section,
        oldKey,
        newKey,
      );
    }

    await prisma.$executeRawUnsafe(
      `
        UPDATE product_settings_catalog
        SET
          parent_value = $1,
          parent_value_key = $2,
          updated_at = NOW()
        WHERE company_id = $3
          AND section IN ('group', 'subgroup')
          AND parent_value_key = $4
      `,
      newValue,
      newKey,
      companyId,
      oldKey,
    );
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

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM product_settings_catalog
        WHERE company_id = $1
          AND section = 'group'
          AND value = $2
          ${parentType ? 'AND parent_value_key = $3' : ''}
      `,
      ...(parentType ? [companyId, oldValue, toCatalogKey(parentType)] : [companyId, oldValue]),
    );

    if (!parentType) return;

    if (!newValue) {
      await prisma.$executeRawUnsafe(
        `
          DELETE FROM product_settings_catalog
          WHERE company_id = $1
            AND section = 'subgroup'
            AND parent_value_key = $2
            AND parent_secondary_value_key = $3
        `,
        companyId,
        toCatalogKey(parentType),
        oldKey,
      );
      return;
    }

    await prisma.$executeRawUnsafe(
      `
        DELETE FROM product_settings_catalog old
        USING product_settings_catalog existing
        WHERE old.company_id = $1
          AND old.section = 'subgroup'
          AND old.parent_value_key = $2
          AND old.parent_secondary_value_key = $3
          AND existing.company_id = old.company_id
          AND existing.section = old.section
          AND existing.value = old.value
          AND existing.parent_value_key = old.parent_value_key
          AND existing.parent_secondary_value_key = $4
      `,
      companyId,
      toCatalogKey(parentType),
      oldKey,
      newKey,
    );

    await prisma.$executeRawUnsafe(
      `
        UPDATE product_settings_catalog
        SET
          parent_secondary_value = $1,
          parent_secondary_value_key = $2,
          updated_at = NOW()
        WHERE company_id = $3
          AND section = 'subgroup'
          AND parent_value_key = $4
          AND parent_secondary_value_key = $5
      `,
      newValue,
      newKey,
      companyId,
      toCatalogKey(parentType),
      oldKey,
    );
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
      await prisma.$executeRawUnsafe(
        `
          DELETE FROM product_settings_catalog
          WHERE company_id = $1
            AND section = 'subgroup'
            AND value = $2
            AND parent_value_key = $3
            AND parent_secondary_value_key = $4
        `,
        companyId,
        oldValue,
        toCatalogKey(parentType),
        toCatalogKey(parentSubtype),
      );
    } else {
      await prisma.$executeRawUnsafe(
        `
          DELETE FROM product_settings_catalog
          WHERE company_id = $1
            AND section = 'subgroup'
            AND value = $2
        `,
        companyId,
        oldValue,
      );
    }
  }
}

/**
 * POST /api/products/rename-type
 * Body: { field: 'productType'|'productSubtype'|'productSubgroup', oldValue: string, newValue: string|null, parentType?: string, parentSubtype?: string }
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
  } = body as {
    action?: string;
    field?: string;
    oldValue?: string;
    newValue?: string | null;
    parentType?: string;
    parentSubtype?: string;
    name?: string;
    subtypeName?: string;
    subgroupName?: string;
  };

  const company = await getOrCreateSingleCompany(auth.userId);
  await Promise.all([ensureProductRegistryTable(), ensureProductSettingsCatalogTable()]);

  // --- Add new line / group / subgroup to catalog (without placeholders) ---
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
      return NextResponse.json({ error: 'parentType e subtypeName são obrigatórios' }, { status: 400 });
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
      return NextResponse.json({ error: 'parentType, parentSubtype e subgroupName são obrigatórios' }, { status: 400 });
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
    return NextResponse.json({ error: 'field deve ser productType, productSubtype ou productSubgroup' }, { status: 400 });
  }
  if (typeof oldValue !== 'string' || oldValue.trim().length === 0) {
    return NextResponse.json({ error: 'oldValue é obrigatório' }, { status: 400 });
  }
  if (newValue !== null && (typeof newValue !== 'string' || newValue.trim().length === 0)) {
    return NextResponse.json({ error: 'newValue deve ser string não-vazia ou null' }, { status: 400 });
  }

  const typedField = field as 'productType' | 'productSubtype' | 'productSubgroup';
  const dbColumn = typedField === 'productType' ? 'product_type' : typedField === 'productSubtype' ? 'product_subtype' : 'product_subgroup';
  const trimmedOld = oldValue.trim();
  const trimmedNew = newValue ? newValue.trim() : null;
  const trimmedParentType = clean(parentType);
  const trimmedParentSubtype = clean(parentSubtype);

  let query: string;
  let params: unknown[];

  if (typedField === 'productSubgroup' && trimmedParentType && trimmedParentSubtype) {
    query = `UPDATE product_registry SET ${dbColumn} = $1, updated_at = NOW() WHERE company_id = $2 AND ${dbColumn} = $3 AND product_type = $4 AND product_subtype = $5`;
    params = [trimmedNew, company.id, trimmedOld, trimmedParentType, trimmedParentSubtype];
  } else if (typedField === 'productSubtype' && trimmedParentType) {
    query = `UPDATE product_registry SET ${dbColumn} = $1, updated_at = NOW() WHERE company_id = $2 AND ${dbColumn} = $3 AND product_type = $4`;
    params = [trimmedNew, company.id, trimmedOld, trimmedParentType];
  } else {
    query = `UPDATE product_registry SET ${dbColumn} = $1, updated_at = NOW() WHERE company_id = $2 AND ${dbColumn} = $3`;
    params = [trimmedNew, company.id, trimmedOld];
  }

  const updated: number = await prisma.$executeRawUnsafe(query, ...params);

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
