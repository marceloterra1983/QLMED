import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import prisma from '@/lib/prisma';
import { estoqueMovimentosQuerySchema } from '@/lib/schemas/estoque';

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
    const parsed = estoqueMovimentosQuerySchema.safeParse({
      productCodigo: searchParams.get('productCodigo') || undefined,
      lot: searchParams.get('lot') || undefined,
      limit: searchParams.get('limit') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const limit = parsed.data.limit ?? 100;
    const where: {
      companyId: string;
      productCodigo?: string;
      lot?: string;
    } = { companyId: company.id };
    if (parsed.data.productCodigo?.trim()) {
      where.productCodigo = parsed.data.productCodigo.trim();
    }
    if (parsed.data.lot != null && parsed.data.lot !== '') {
      where.lot = parsed.data.lot.trim();
    }

    const movements = await prisma.stockMovement.findMany({
      where,
      orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
      take: limit,
      select: {
        id: true,
        productCodigo: true,
        productName: true,
        lot: true,
        lotExpiry: true,
        quantity: true,
        direction: true,
        locationType: true,
        locationCnpj: true,
        locationName: true,
        kind: true,
        reason: true,
        invoiceId: true,
        occurredAt: true,
        createdAt: true,
        createdBy: true,
      },
    });

    return NextResponse.json({
      movements: movements.map((m) => ({
        ...m,
        quantity: Number(m.quantity),
      })),
    });
  } catch (error) {
    return apiError(error, 'estoque/controle/movimentos');
  }
}
