import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { rebuildProductAggregatesForCompany } from '@/lib/product-aggregate-rebuild';
import { apiError } from '@/lib/api-error';

export async function POST() {
  try {
    let userId: string;
    try {
      userId = (await requireAdmin()).userId;
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const result = await rebuildProductAggregatesForCompany(company.id);
    if (!result) {
      return NextResponse.json(
        { error: 'Já existe uma reconstrução de agregados em andamento' },
        { status: 409 },
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      cutoffCreatedAt: result.cutoffCreatedAt.toISOString(),
      pagination: { mode: 'keyset', pageSize: 100, complete: true },
    });
  } catch (error) {
    return apiError(error, 'products/rebuild-aggregates');
  }
}
