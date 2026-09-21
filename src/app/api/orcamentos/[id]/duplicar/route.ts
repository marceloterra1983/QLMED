import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { duplicateQuote } from '@/lib/orcamentos/store';

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    let userId: string;
    try {
      userId = (await requireEditor()).userId;
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { id } = await ctx.params;
    const quote = await duplicateQuote(company.id, userId, id);
    if (!quote) return NextResponse.json({ error: 'Orçamento não encontrado' }, { status: 404 });
    return NextResponse.json(quote, { status: 201 });
  } catch (error) {
    return apiError(error, 'orcamentos/duplicar');
  }
}
