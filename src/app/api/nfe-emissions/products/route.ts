import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';

export async function GET(req: Request) {
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const search = (new URL(req.url).searchParams.get('search') || '').trim();
    const products = await prisma.productRegistry.findMany({
      where: {
        companyId: company.id,
        ...(search
          ? {
              OR: [
                { description: { contains: search, mode: 'insensitive' } },
                { code: { contains: search, mode: 'insensitive' } },
                { shortName: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      take: 30,
      orderBy: { description: 'asc' },
      select: {
        id: true,
        code: true,
        description: true,
        ncm: true,
        unit: true,
        ean: true,
        anvisaCode: true,
        fiscalCfopSaida: true,
        fiscalCest: true,
        fiscalSitTributaria: true,
        fiscalIcms: true,
        fiscalCstPis: true,
        fiscalCstCofins: true,
        fiscalOrigem: true,
        aggLastSalePrice: true,
      },
    });
    return NextResponse.json({ products });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/products');
  }
}
