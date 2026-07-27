import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import prisma from '@/lib/prisma';
import { cleanString } from '@/lib/utils';
import { apiError, apiValidationError } from '@/lib/api-error';
import { bulkUpdateSchema } from '@/lib/schemas/product';

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

async function nextCodigo(companyId: string): Promise<string> {
  const codigos = await prisma.productRegistry.findMany({
    where: { companyId, NOT: { codigo: null } },
    select: { codigo: true },
  });
  let maxNum = 0;
  for (const row of codigos) {
    const digits = (row.codigo || '').replace(/\D/g, '');
    if (!digits) continue;
    const n = Number(digits);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  return String(maxNum + 1).padStart(5, '0');
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

    const validated = bulkUpdateSchema.safeParse(body);
    if (!validated.success) return apiValidationError(validated.error);

    const products: ProductItem[] = validated.data.products;
    const fields: Record<string, unknown> = validated.data.fields;

    const hasAnvisa = 'anvisa' in fields;
    const anvisaVal: string | null = hasAnvisa
      ? fields.anvisa === null || fields.anvisa === ''
        ? null
        : (() => {
            const n = normalizeAnvisa(fields.anvisa);
            if (!n) throw new Error('ANVISA_INVALID');
            return n;
          })()
      : null;

    let updated = 0;
    const now = new Date();

    for (const p of products) {
      const key = cleanString(p.productKey);
      if (!key) continue;

      const description =
        ('description' in fields ? cleanString(fields.description) : null) ||
        cleanString(p.description) ||
        cleanString(p.code) ||
        key;

      const updateData: Record<string, unknown> = { updatedAt: now };
      if ('description' in fields) updateData.description = description;
      if ('productType' in fields) updateData.productType = cleanString(fields.productType);
      if ('productSubtype' in fields) updateData.productSubtype = cleanString(fields.productSubtype);
      if ('productSubgroup' in fields) updateData.productSubgroup = cleanString(fields.productSubgroup);
      if ('ncm' in fields) updateData.ncm = cleanString(fields.ncm);
      if ('shortName' in fields) updateData.shortName = cleanString(fields.shortName);
      if ('outOfLine' in fields) updateData.outOfLine = fields.outOfLine === true;
      if ('instrumental' in fields) updateData.instrumental = fields.instrumental === true;
      if (hasAnvisa) {
        updateData.anvisaCode = anvisaVal;
        if (anvisaVal) updateData.anvisaSource = 'manual';
      }
      if ('fiscalSitTributaria' in fields) updateData.fiscalSitTributaria = cleanString(fields.fiscalSitTributaria);
      if ('fiscalNomeTributacao' in fields) updateData.fiscalNomeTributacao = cleanString(fields.fiscalNomeTributacao);
      if ('fiscalIcms' in fields) updateData.fiscalIcms = toNullableNumber(fields.fiscalIcms);
      if ('fiscalPis' in fields) updateData.fiscalPis = toNullableNumber(fields.fiscalPis);
      if ('fiscalCofins' in fields) updateData.fiscalCofins = toNullableNumber(fields.fiscalCofins);
      if ('fiscalObs' in fields) updateData.fiscalObs = cleanString(fields.fiscalObs);
      if ('fiscalCest' in fields) updateData.fiscalCest = cleanString(fields.fiscalCest);
      if ('fiscalOrigem' in fields) updateData.fiscalOrigem = cleanString(fields.fiscalOrigem);
      if ('fiscalCfopEntrada' in fields) updateData.fiscalCfopEntrada = cleanString(fields.fiscalCfopEntrada);
      if ('fiscalCfopSaida' in fields) updateData.fiscalCfopSaida = cleanString(fields.fiscalCfopSaida);
      if ('fiscalIpi' in fields) updateData.fiscalIpi = toNullableNumber(fields.fiscalIpi);
      if ('fiscalFcp' in fields) updateData.fiscalFcp = toNullableNumber(fields.fiscalFcp);
      if ('fiscalCstIpi' in fields) updateData.fiscalCstIpi = cleanString(fields.fiscalCstIpi);
      if ('fiscalCstPis' in fields) updateData.fiscalCstPis = cleanString(fields.fiscalCstPis);
      if ('fiscalCstCofins' in fields) updateData.fiscalCstCofins = cleanString(fields.fiscalCstCofins);
      if ('fiscalObsIcms' in fields) updateData.fiscalObsIcms = cleanString(fields.fiscalObsIcms);
      if ('fiscalObsPisCofins' in fields) updateData.fiscalObsPisCofins = cleanString(fields.fiscalObsPisCofins);
      if ('productRefs' in fields) {
        updateData.productRefs = Array.isArray(fields.productRefs) ? fields.productRefs : [];
      }
      if ('manufacturerShortName' in fields) {
        updateData.manufacturerShortName = cleanString(fields.manufacturerShortName);
      }
      if ('defaultSupplier' in fields) updateData.defaultSupplier = cleanString(fields.defaultSupplier);

      const existing = await prisma.productRegistry.findUnique({
        where: {
          companyId_productKey: {
            companyId: company.id,
            productKey: key,
          },
        },
        select: { id: true },
      });

      if (existing) {
        await prisma.productRegistry.update({
          where: { id: existing.id },
          data: updateData,
        });
      } else {
        const codigo = await nextCodigo(company.id);
        await prisma.productRegistry.create({
          data: {
            id: randomUUID(),
            companyId: company.id,
            productKey: key,
            code: cleanString(p.code),
            description,
            ncm: 'ncm' in fields ? cleanString(fields.ncm) : cleanString(p.ncm),
            unit: cleanString(p.unit),
            ean: cleanString(p.ean),
            productType: 'productType' in fields ? cleanString(fields.productType) : null,
            productSubtype: 'productSubtype' in fields ? cleanString(fields.productSubtype) : null,
            productSubgroup: 'productSubgroup' in fields ? cleanString(fields.productSubgroup) : null,
            shortName: 'shortName' in fields ? cleanString(fields.shortName) : null,
            anvisaCode: hasAnvisa ? anvisaVal : null,
            anvisaSource: hasAnvisa && anvisaVal ? 'manual' : null,
            outOfLine: 'outOfLine' in fields ? fields.outOfLine === true : false,
            instrumental: 'instrumental' in fields ? fields.instrumental === true : false,
            fiscalSitTributaria:
              'fiscalSitTributaria' in fields ? cleanString(fields.fiscalSitTributaria) : null,
            fiscalNomeTributacao:
              'fiscalNomeTributacao' in fields ? cleanString(fields.fiscalNomeTributacao) : null,
            fiscalIcms: 'fiscalIcms' in fields ? toNullableNumber(fields.fiscalIcms) : null,
            fiscalPis: 'fiscalPis' in fields ? toNullableNumber(fields.fiscalPis) : null,
            fiscalCofins: 'fiscalCofins' in fields ? toNullableNumber(fields.fiscalCofins) : null,
            fiscalObs: 'fiscalObs' in fields ? cleanString(fields.fiscalObs) : null,
            fiscalCest: 'fiscalCest' in fields ? cleanString(fields.fiscalCest) : null,
            fiscalOrigem: 'fiscalOrigem' in fields ? cleanString(fields.fiscalOrigem) : null,
            fiscalCfopEntrada:
              'fiscalCfopEntrada' in fields ? cleanString(fields.fiscalCfopEntrada) : null,
            fiscalCfopSaida: 'fiscalCfopSaida' in fields ? cleanString(fields.fiscalCfopSaida) : null,
            fiscalIpi: 'fiscalIpi' in fields ? toNullableNumber(fields.fiscalIpi) : null,
            fiscalFcp: 'fiscalFcp' in fields ? toNullableNumber(fields.fiscalFcp) : null,
            fiscalCstIpi: 'fiscalCstIpi' in fields ? cleanString(fields.fiscalCstIpi) : null,
            fiscalCstPis: 'fiscalCstPis' in fields ? cleanString(fields.fiscalCstPis) : null,
            fiscalCstCofins: 'fiscalCstCofins' in fields ? cleanString(fields.fiscalCstCofins) : null,
            fiscalObsIcms: 'fiscalObsIcms' in fields ? cleanString(fields.fiscalObsIcms) : null,
            fiscalObsPisCofins:
              'fiscalObsPisCofins' in fields ? cleanString(fields.fiscalObsPisCofins) : null,
            productRefs:
              'productRefs' in fields && Array.isArray(fields.productRefs) ? fields.productRefs as string[] : [],
            manufacturerShortName:
              'manufacturerShortName' in fields ? cleanString(fields.manufacturerShortName) : null,
            defaultSupplier: 'defaultSupplier' in fields ? cleanString(fields.defaultSupplier) : null,
            codigo,
            createdAt: now,
            updatedAt: now,
          },
        });
      }

      updated++;
    }

    return NextResponse.json({ updated });
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'ANVISA_INVALID') {
      return NextResponse.json(
        { error: 'Código ANVISA inválido. Informe exatamente 11 dígitos.' },
        { status: 400 },
      );
    }
    return apiError(e, 'POST /api/products/bulk-update');
  }
}
