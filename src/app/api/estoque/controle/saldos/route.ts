import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { listStockBalances } from '@/lib/stock-ledger';
import { estoqueSaldosQuerySchema } from '@/lib/schemas/estoque';

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
    const parsed = estoqueSaldosQuerySchema.safeParse({
      q: searchParams.get('q') || undefined,
      locationType: searchParams.get('locationType') || undefined,
      validity: searchParams.get('validity') || undefined,
      limit: searchParams.get('limit') || undefined,
    });
    if (!parsed.success) return apiValidationError(parsed.error);

    const balances = await listStockBalances(company.id, {
      q: parsed.data.q,
      locationType: parsed.data.locationType,
      validity: parsed.data.validity,
      limit: parsed.data.limit,
    });
    return NextResponse.json({ balances });
  } catch (error) {
    return apiError(error, 'estoque/controle/saldos');
  }
}
