import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { quoteSearchQuerySchema } from '@/lib/schemas/orcamentos';
import { searchQuoteProdutos } from '@/lib/orcamentos/catalog';

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const parsed = quoteSearchQuerySchema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);
    const produtos = await searchQuoteProdutos(
      company.id,
      parsed.data.q || '',
      parsed.data.limit,
      parsed.data.lineStatus,
    );
    return NextResponse.json({ produtos });
  } catch (error) {
    return apiError(error, 'orcamentos/produtos');
  }
}
