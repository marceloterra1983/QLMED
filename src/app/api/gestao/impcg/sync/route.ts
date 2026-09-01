import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { runImpcgIngest } from '@/lib/impcg/ingest';

export async function POST() {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }

  try {
    const company = await getOrCreateSingleCompany(userId);
    const result = await runImpcgIngest(company.id);
    if (result.busy) {
      return NextResponse.json({ ok: false, error: 'Coleta em andamento' }, { status: 409 });
    }
    // JOB-004: a resposta omitia as falhas de upload, então uma coleta que
    // perdeu ofícios chegava à tela indistinguível de uma coleta limpa.
    return NextResponse.json({
      ok: result.ok,
      processed: result.processed,
      skipped: result.skipped,
      failedUploads: result.failedUploads,
      failedPersists: result.failedPersists,
      failedMailboxes: result.failedMailboxes,
      lastCollectedAt: result.lastCollectedAt,
    });
  } catch (error) {
    return apiError(error, 'gestao/impcg/sync');
  }
}
