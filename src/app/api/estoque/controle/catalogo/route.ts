import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { listCatalogStock } from '@/lib/stock-catalog-query';
import { filterStockProducts } from '@/lib/stock-catalog';
import { estoqueCatalogoQuerySchema } from '@/lib/schemas/estoque';

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const parsed = estoqueCatalogoQuerySchema.safeParse({
      q: searchParams.get('q') || undefined,
      locationType: searchParams.get('locationType') || undefined,
      validity: searchParams.get('validity') || undefined,
      includeZero: searchParams.get('includeZero') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const includeZero = parsed.data.includeZero !== false;
    const products = await listCatalogStock(company.id, {
      includeZero,
      minQty: includeZero ? 0 : 0,
    });
    const filtered = filterStockProducts(products, {
      q: parsed.data.q,
      locationType: parsed.data.locationType ?? 'ALL',
      validity: parsed.data.validity ?? 'ALL',
      minQty: includeZero ? 0 : 0.0001,
    });
    return NextResponse.json({
      products: filtered.map((p) => ({
        ...p,
        lots: includeZero ? p.lots : p.lots.filter((l) => l.quantity > 0),
      })),
    });
  } catch (error) {
    return apiError(error, 'estoque/controle/catalogo');
  }
}
