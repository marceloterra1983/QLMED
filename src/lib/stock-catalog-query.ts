import prisma from '@/lib/prisma';
import { listStockBalances } from '@/lib/stock-ledger';
import { mergeCatalogWithBalances, type StockCatalogProduct } from '@/lib/stock-catalog';

export async function listCatalogStock(
  companyId: string,
  opts: { includeZero?: boolean; minQty?: number } = {},
): Promise<StockCatalogProduct[]> {
  const [catalog, balances] = await Promise.all([
    prisma.productRegistry.findMany({
      where: { companyId },
      select: {
        codigo: true,
        code: true,
        description: true,
        productType: true,
        productSubtype: true,
        productSubgroup: true,
        manufacturerShortName: true,
        anvisaManufacturer: true,
        shortName: true,
      },
    }),
    listStockBalances(companyId, {
      locationType: 'ALL',
      limit: 0,
      includeZero: opts.includeZero ?? true,
    }),
  ]);
  return mergeCatalogWithBalances(catalog, balances, {
    includeZero: opts.includeZero ?? true,
    minQty: opts.minQty ?? 0,
  });
}
