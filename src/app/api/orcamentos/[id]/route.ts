import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError, apiValidationError } from '@/lib/api-error';
import { quoteUpsertSchema } from '@/lib/schemas/orcamentos';
import { getQuote, updateQuote } from '@/lib/orcamentos/store';

type Ctx = { params: Promise<{ id: string }> };

function asAuthError(error: unknown) {
  if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
  return unauthorizedResponse();
}

export async function GET(_req: Request, ctx: Ctx) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await ctx.params;
    const quote = await getQuote(company.id, id);
    if (!quote) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    return NextResponse.json(quote);
  } catch (error) {
    return apiError(error, 'orcamentos/[id]');
  }
}

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (error) {
      return asAuthError(error);
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await ctx.params;
    const parsed = quoteUpsertSchema.safeParse(await req.json());
    if (!parsed.success) return apiValidationError(parsed.error);
    try {
      const result = await updateQuote(company.id, id, parsed.data);
      if (result.kind === 'missing') {
        return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
      }
      if (result.kind === 'cancelled') {
        return NextResponse.json({ error: 'Orçamento cancelado não pode ser editado' }, { status: 409 });
      }
      return NextResponse.json(result.quote);
    } catch (error) {
      if (error instanceof Error && /Quantidade|Desconto|Frete|item|CNPJ|Preço/i.test(error.message)) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    return apiError(error, 'orcamentos/[id]');
  }
}
