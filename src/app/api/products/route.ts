import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { buildProductsListPayload } from '@/lib/product-aggregation';
import type { ProductsListQueryParams } from '@/lib/product-aggregation';
import { createLogger } from '@/lib/logger';
import { productsLegacyQuerySchema } from '@/lib/schemas/product';
import { apiValidationError } from '@/lib/api-error';

const log = createLogger('products');

const MAX_LIMIT = 200;

function toPositiveInt(value: string | null, fallback: number, max: number) {
  const parsed = parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    log.warn('[DEPRECATED] /api/products called — use /api/products/list instead');

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);

    const parsed = productsLegacyQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);

    const params: ProductsListQueryParams = {
      page: toPositiveInt(searchParams.get('page'), 1, 100000),
      limit: toPositiveInt(searchParams.get('limit'), 50, MAX_LIMIT),
      search: (searchParams.get('search') || '').trim(),
      sort: searchParams.get('sort') || 'lastIssue',
      order: searchParams.get('order') === 'asc' ? 'asc' : 'desc',
      useAnvisaLookup: searchParams.get('anvisaLookup') === '1',
      useIssuedNfeLookup: searchParams.get('issuedNfeLookup') === '1',
      onlyMissingAnvisa: searchParams.get('onlyMissingAnvisa') === '1',
      exportAll: searchParams.get('exportAll') === '1',
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    };

    const payload = await buildProductsListPayload(company.id, params);

    const response = NextResponse.json(payload);
    response.headers.set('X-Deprecated', 'Use /api/products/list instead');
    return response;
  } catch (error) {
    log.error({ err: error }, 'Error fetching products');
    const errorResponse = NextResponse.json({ error: 'Erro interno' }, { status: 500 });
    errorResponse.headers.set('X-Deprecated', 'Use /api/products/list instead');
    return errorResponse;
  }
}
