import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { listStockBalances, type StockLocationType } from '@/lib/stock-ledger';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const params = new URL(req.url).searchParams;
    const codigo = (params.get('codigo') || params.get('cProd') || '').trim();
    const locationType = (params.get('locationType') || 'CD') as StockLocationType;
    if (!codigo) {
      return NextResponse.json({ lots: [] });
    }
    const balances = await listStockBalances(company.id, {
      locationType: locationType === 'CUSTOMER' ? 'CUSTOMER' : 'CD',
      includeZero: false,
    });
    const lots = balances
      .filter((b) => b.quantity > 0 && (
        b.productCodigo === codigo
        || b.productCodigo.toLowerCase() === codigo.toLowerCase()
      ))
      .map((b) => ({
        lot: b.lot,
        lotExpiry: b.lotExpiry,
        quantity: b.quantity,
        locationType: b.locationType,
      }));
    return NextResponse.json({ lots });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/stock-lots');
  }
}
