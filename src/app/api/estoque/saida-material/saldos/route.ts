import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { listStockBalances } from '@/lib/stock-ledger';
import { saidaMaterialSaldosQuerySchema } from '@/lib/schemas/estoque';
import prisma from '@/lib/prisma';

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
    const parsed = saidaMaterialSaldosQuerySchema.safeParse({
      q: searchParams.get('q') || undefined,
      locationType: searchParams.get('locationType') || undefined,
      locationCnpj: searchParams.get('locationCnpj') || undefined,
      limit: searchParams.get('limit') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const locationType = parsed.data.locationType ?? 'CD';
    let balances = await listStockBalances(company.id, {
      q: parsed.data.q,
      locationType,
      limit: parsed.data.limit ?? 0,
    });

    balances = balances.filter((b) => b.quantity > 0);

    const cnpjFilter = (parsed.data.locationCnpj || '').replace(/\D/g, '');
    if (locationType === 'CUSTOMER' && cnpjFilter) {
      balances = balances.filter((b) => (b.locationCnpj || '') === cnpjFilter);
    }

    const codigos = [...new Set(balances.map((b) => b.productCodigo))];
    const products = codigos.length
      ? await prisma.productRegistry.findMany({
          where: {
            companyId: company.id,
            OR: [
              { codigo: { in: codigos } },
              { code: { in: codigos } },
            ],
          },
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
        })
      : [];

    const byCodigo = new Map<string, (typeof products)[number]>();
    for (const p of products) {
      if (p.codigo) byCodigo.set(p.codigo, p);
      if (p.code) byCodigo.set(p.code, p);
    }

    const enriched = balances.map((b) => {
      const p = byCodigo.get(b.productCodigo);
      return {
        ...b,
        productName: b.productName || p?.shortName || p?.description || null,
        description: p?.description ?? b.productName ?? null,
        productType: p?.productType ?? null,
        productSubtype: p?.productSubtype ?? null,
        productSubgroup: p?.productSubgroup ?? null,
        manufacturer: p?.manufacturerShortName || p?.anvisaManufacturer || null,
      };
    });

    return NextResponse.json({ balances: enriched });
  } catch (error) {
    return apiError(error, 'estoque/saida-material/saldos');
  }
}
