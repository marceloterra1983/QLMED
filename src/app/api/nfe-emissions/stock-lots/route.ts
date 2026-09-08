import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import prisma from '@/lib/prisma';
import { listStockBalances, type StockLocationType } from '@/lib/stock-ledger';
import { filterStockLotsForProduct } from '@/lib/nfe-emission/stock-lot-match';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const params = new URL(req.url).searchParams;
    const codigo = (params.get('codigo') || params.get('cProd') || '').trim();
    const productId = (params.get('productId') || '').trim();
    const locationType = (params.get('locationType') || 'CD') as StockLocationType;
    if (!codigo && !productId) {
      return NextResponse.json({ lots: [] });
    }
    let catalog: Array<{ code: string | null; codigo: string | null }> = [];
    if (productId) {
      catalog = await prisma.productRegistry.findMany({
        where: { companyId: company.id, id: productId },
        select: { code: true, codigo: true },
      });
    }
    if (catalog.length === 0 && codigo) {
      catalog = await prisma.productRegistry.findMany({
        where: {
          companyId: company.id,
          OR: [
            { code: { equals: codigo, mode: 'insensitive' } },
            { codigo: { equals: codigo, mode: 'insensitive' } },
          ],
        },
        select: { code: true, codigo: true },
      });
    }
    const balances = await listStockBalances(company.id, {
      locationType: locationType === 'CUSTOMER' ? 'CUSTOMER' : 'CD',
      includeZero: false,
    });
    const lots = filterStockLotsForProduct(balances, codigo, catalog).map((b) => ({
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
