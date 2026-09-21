import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { runQuoteArchiveImport } from '@/lib/orcamentos/archive-import';

export async function POST(req: Request) {
  let userId: string;
  try {
    userId = (await requireEditor()).userId;
  } catch (error) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }
  try {
    const company = await getOrCreateSingleCompany(userId);
    let source: 'disk' | 'mail' | 'all' = 'all';
    try {
      const body = (await req.json()) as { source?: string };
      if (body.source === 'disk' || body.source === 'mail' || body.source === 'all') source = body.source;
    } catch {
      source = 'all';
    }
    const result = await runQuoteArchiveImport(company.id, source);
    if (result.busy) {
      return NextResponse.json({ ok: false, error: 'Importação em andamento' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error, 'orcamentos/arquivo-import');
  }
}
