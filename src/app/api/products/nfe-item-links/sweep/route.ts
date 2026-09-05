import { NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { runNfeItemLinkSweep } from '@/lib/nfe-item-link/sweep';

/** SPEC-047: varredura completa (desde 2021) sob demanda; um lock por empresa. */
export async function POST(req: Request) {
  try {
    let userId: string;
    try {
      userId = (await requireAdmin()).userId;
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const result = await runNfeItemLinkSweep({
      companyId: company.id,
      dryRun: searchParams.get('dryRun') === '1',
      force: searchParams.get('force') === '1',
    });
    if (!result) {
      return NextResponse.json({ error: 'Já existe uma varredura de vínculos em andamento' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error, 'products/nfe-item-links/sweep');
  }
}
