import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { quoteListQuerySchema, quoteUpsertSchema } from '@/lib/schemas/orcamentos';
import { createQuote, listQuotes } from '@/lib/orcamentos/store';

function asAuthError(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
  return unauthorizedResponse();
}

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
    const parsed = quoteListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);
    const listing = await listQuotes(company.id, parsed.data);
    return NextResponse.json(listing);
  } catch (error) {
    return apiError(error, 'orcamentos');
  }
}

export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (error) {
      return asAuthError(error);
    }
    const company = await getOrCreateSingleCompany(userId);
    const parsed = quoteUpsertSchema.safeParse(await req.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    try {
      const quote = await createQuote(company.id, userId, parsed.data);
      return NextResponse.json(quote, { status: 201 });
    } catch (error) {
      if (error instanceof Error && /Quantidade|Desconto|Frete|item|CNPJ|número|Preço/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    return apiError(error, 'orcamentos');
  }
}
