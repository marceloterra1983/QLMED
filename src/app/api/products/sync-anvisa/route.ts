import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  type ProductRegistryRow,
  upsertProductRegistry,
} from '@/lib/product-registry-store';
import { cleanString } from '@/lib/utils';
import { apiError, apiValidationError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';
import { syncAnvisaSchema } from '@/lib/schemas/product';
import { resolveAnvisaByCodeAndName } from '@/lib/anvisa-open-data';
import prisma from '@/lib/prisma';

const log = createLogger('products/sync-anvisa');

function normalizeAnvisaCode(value: unknown): string | null {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (digits.length !== 11) return null;
  return digits;
}

export async function POST(req: Request) {
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
    const body = await req.json().catch(() => ({}));
    const parsed = syncAnvisaSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);
    const mode = parsed.data.mode;

    const products = await prisma.productRegistry.findMany({
      where: { companyId: company.id },
      orderBy: { updatedAt: 'desc' },
    });

    const now = new Date();
    let processed = 0;
    let manualSkipped = 0;
    let updated = 0;
    let unchanged = 0;
    let fromXml = 0;
    let fromIssued = 0;
    let fromCatalog = 0;

    for (const product of products) {
      processed += 1;
      const isManual = product.anvisaSource === 'manual';

      const baseUpdate = {
        code: cleanString(product.code),
        description: cleanString(product.description) || 'Produto sem descrição',
        ncm: cleanString(product.ncm),
        unit: cleanString(product.unit),
        ean: cleanString(product.ean),
      };

      if (isManual) {
        manualSkipped += 1;
        const manualAnvisa = normalizeAnvisaCode(product.anvisaCode);

        await upsertProductRegistry({
          companyId: company.id,
          productKey: product.productKey,
          ...baseUpdate,
          anvisaCode: manualAnvisa,
          anvisaSource: 'manual',
          anvisaConfidence: manualAnvisa ? 1 : null,
          anvisaMatchedProductName: product.anvisaMatchedProductName || null,
          anvisaHolder: product.anvisaHolder || null,
          anvisaProcess: product.anvisaProcess || null,
          anvisaStatus:
            product.anvisaStatus || (manualAnvisa ? 'Definido manualmente' : 'Aguardando edição manual'),
          anvisaSyncedAt: product.anvisaSyncedAt || now,
        });
        continue;
      }

      let normalizedAnvisa = normalizeAnvisaCode(product.anvisaCode);
      let matchMethod: string | null = product.anvisaSource || null;
      let matchConfidence =
        typeof product.anvisaConfidence === 'number' ? product.anvisaConfidence : null;
      let matchedProductName = cleanString(product.anvisaMatchedProductName);
      let holder = cleanString(product.anvisaHolder);
      let process = cleanString(product.anvisaProcess);
      let status = cleanString(product.anvisaStatus);

      // missing: só preenche vazio. all: re-consulta o catálogo para corrigir divergências.
      if (!normalizedAnvisa || mode === 'all') {
        try {
          const match = await resolveAnvisaByCodeAndName({
            code: product.code,
            description: product.description,
          });
          if (match) {
            normalizedAnvisa = normalizeAnvisaCode(match.registration);
            matchMethod = match.method;
            matchConfidence = match.confidence;
            matchedProductName = cleanString(match.matchedProductName);
            holder = cleanString(match.holder);
            process = cleanString(match.process);
            status = cleanString(match.status);
          }
        } catch (err) {
          log.warn({ err, productKey: product.productKey }, 'ANVISA catalog lookup failed');
        }
      }

      if (matchMethod === 'xml') fromXml += 1;
      else if (matchMethod === 'issued_nfe') fromIssued += 1;
      else if (matchMethod === 'catalog_code_exact' || matchMethod === 'catalog_name') fromCatalog += 1;

      const currentCode = normalizeAnvisaCode(product.anvisaCode);
      const shouldUpdateAnvisa =
        mode === 'all'
          ? currentCode !== normalizedAnvisa
          : !currentCode && !!normalizedAnvisa;

      if (!shouldUpdateAnvisa) {
        unchanged += 1;
        await upsertExistingRegistryBase(product, baseUpdate, company.id, product.productKey);
        continue;
      }

      await upsertProductRegistry({
        companyId: company.id,
        productKey: product.productKey,
        ...baseUpdate,
        anvisaCode: normalizedAnvisa,
        anvisaSource: matchMethod,
        anvisaConfidence: normalizedAnvisa ? matchConfidence : null,
        anvisaMatchedProductName: normalizedAnvisa ? matchedProductName : null,
        anvisaHolder: normalizedAnvisa ? holder : null,
        anvisaProcess: normalizedAnvisa ? process : null,
        anvisaStatus: normalizedAnvisa ? status : null,
        anvisaSyncedAt: now,
      });
      updated += 1;
    }

    return NextResponse.json({
      ok: true,
      stats: {
        mode,
        processed,
        updated,
        unchanged,
        manualSkipped,
        fromXml,
        fromIssued,
        fromCatalog,
      },
    });
  } catch (error) {
    return apiError(error, 'products/sync-anvisa');
  }
}

async function upsertExistingRegistryBase(
  existing: Pick<
    ProductRegistryRow,
    | 'anvisaCode'
    | 'anvisaSource'
    | 'anvisaConfidence'
    | 'anvisaMatchedProductName'
    | 'anvisaHolder'
    | 'anvisaProcess'
    | 'anvisaStatus'
    | 'anvisaSyncedAt'
  >,
  baseUpdate: {
    code: string | null;
    description: string;
    ncm: string | null;
    unit: string | null;
    ean: string | null;
  },
  companyId: string,
  productKey: string,
) {
  await upsertProductRegistry({
    companyId,
    productKey,
    ...baseUpdate,
    anvisaCode: normalizeAnvisaCode(existing.anvisaCode),
    anvisaSource: cleanString(existing.anvisaSource),
    anvisaConfidence:
      typeof existing.anvisaConfidence === 'number' ? existing.anvisaConfidence : null,
    anvisaMatchedProductName: cleanString(existing.anvisaMatchedProductName),
    anvisaHolder: cleanString(existing.anvisaHolder),
    anvisaProcess: cleanString(existing.anvisaProcess),
    anvisaStatus: cleanString(existing.anvisaStatus),
    anvisaSyncedAt: existing.anvisaSyncedAt || null,
  });
}
