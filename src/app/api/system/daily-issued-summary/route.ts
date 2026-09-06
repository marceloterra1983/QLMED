import { NextRequest, NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { runDailyIssuedSummary } from '@/lib/daily-issued-summary-job';

/**
 * Catch-up / trigger do Resumo Diário (SPEC-046).
 * Sessão editor+ ou API key com `invoices:write` (QLMED_API_KEY em app.env).
 * Chaves só com `invoices:read` também passam (chave legada do n8n no override).
 */
export async function POST(request: NextRequest) {
  try {
    try {
      await requireEditor({ apiKeyScope: 'invoices:write' });
    } catch (writeErr) {
      try {
        await requireEditor({ apiKeyScope: 'invoices:read' });
      } catch (readErr) {
        const err = writeErr instanceof Error ? writeErr : readErr;
        if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
        return unauthorizedResponse();
      }
    }

    let dryRun = false;
    try {
      const body = (await request.json()) as { dryRun?: boolean };
      dryRun = body?.dryRun === true;
    } catch {
      // body opcional
    }

    const result = await runDailyIssuedSummary({ dryRun });
    const ok = result.status !== 'error';
    return NextResponse.json(result, { status: ok ? 200 : 500 });
  } catch (error) {
    return apiError(error, 'daily-issued-summary');
  }
}
