import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import {
  getProductRegistryByKeys,
  type ProductRegistryRow,
  upsertProductRegistry,
} from '@/lib/product-registry-store';
import { cleanString } from '@/lib/utils';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('products/sync-anvisa');

interface SyncProductItem {
  key: string;
  code: string;
  description: string;
  ncm: string | null;
  unit: string;
  ean?: string | null;
  anvisa: string | null;
  anvisaMatchMethod?: 'xml' | 'issued_nfe' | 'catalog_code_exact' | 'catalog_name' | null;
  anvisaConfidence?: number | null;
  anvisaMatchedProductName?: string | null;
  anvisaHolder?: string | null;
  anvisaProcess?: string | null;
  anvisaStatus?: string | null;
}

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
    const mode = body?.mode === 'all' ? 'all' : 'missing';

    const origin = new URL(req.url).origin;
    const cookieHeader = req.headers.get('cookie') || '';
    const limit = 200;
    let page = 1;
    let totalPages = 1;
    const products: SyncProductItem[] = [];

    while (page <= totalPages) {
      const url = new URL('/api/products', origin);
      url.searchParams.set('page', String(page));
      url.searchParams.set('limit', String(limit));
      url.searchParams.set('sort', 'quantity');
      url.searchParams.set('order', 'desc');
      url.searchParams.set('issuedNfeLookup', '1');
      url.searchParams.set('anvisaLookup', '1');

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: cookieHeader ? { cookie: cookieHeader } : undefined,
        cache: 'no-store',
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => '');
        return NextResponse.json(
          { error: `Falha na leitura de produtos para sincronização (HTTP ${response.status})`, detail },
          { status: 500 },
        );
      }

      const payload = await response.json();
      const pageProducts = Array.isArray(payload?.products) ? payload.products : [];
      products.push(...pageProducts);
      totalPages = Number(payload?.pagination?.pages || 1);
      page += 1;
    }

    const productKeys = products.map((product) => product.key);
    const existingRows =
      productKeys.length > 0
        ? await getProductRegistryByKeys(company.id, productKeys)
        : [];

    const existingByKey = new Map(existingRows.map((row) => [row.productKey, row]));
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
      const existing = existingByKey.get(product.key);
      const isManual = existing?.anvisaSource === 'manual';

      const baseUpdate = {
        code: cleanString(product.code),
        description: cleanString(product.description) || 'Produto sem descrição',
        ncm: cleanString(product.ncm),
        unit: cleanString(product.unit),
        ean: cleanString(product.ean),
      };

      if (isManual) {
        manualSkipped += 1;
        const manualAnvisa = normalizeAnvisaCode(existing?.anvisaCode);

        await upsertProductRegistry({
          companyId: company.id,
          productKey: product.key,
          ...baseUpdate,
          anvisaCode: manualAnvisa,
          anvisaSource: 'manual',
          anvisaConfidence: manualAnvisa ? 1 : null,
          anvisaMatchedProductName: existing?.anvisaMatchedProductName || null,
          anvisaHolder: existing?.anvisaHolder || null,
          anvisaProcess: existing?.anvisaProcess || null,
          anvisaStatus:
            existing?.anvisaStatus || (manualAnvisa ? 'Definido manualmente' : 'Aguardando edição manual'),
          anvisaSyncedAt: existing?.anvisaSyncedAt || now,
        });

        continue;
      }

      const normalizedAnvisa = normalizeAnvisaCode(product.anvisa);
      const matchMethod = product.anvisaMatchMethod || null;
      const matchConfidence = typeof product.anvisaConfidence === 'number' ? product.anvisaConfidence : null;
      const matchedProductName = cleanString(product.anvisaMatchedProductName);
      const holder = cleanString(product.anvisaHolder);
      const process = cleanString(product.anvisaProcess);
      const status = cleanString(product.anvisaStatus);

      if (matchMethod === 'xml') fromXml += 1;
      else if (matchMethod === 'issued_nfe') fromIssued += 1;
      else if (matchMethod === 'catalog_code_exact' || matchMethod === 'catalog_name') fromCatalog += 1;

      if (existing) {
        const currentCode = normalizeAnvisaCode(existing.anvisaCode);
        const shouldUpdateAnvisa =
          mode === 'all'
            ? currentCode !== normalizedAnvisa
            : !currentCode && !!normalizedAnvisa;

        if (!shouldUpdateAnvisa) {
          unchanged += 1;
          await upsertExistingRegistryBase(existing, baseUpdate, company.id, product.key);
          continue;
        }

        await upsertProductRegistry({
          companyId: company.id,
          productKey: product.key,
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
        continue;
      }

      await upsertProductRegistry({
        companyId: company.id,
        productKey: product.key,
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
  existing: ProductRegistryRow,
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
