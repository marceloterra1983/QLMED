import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { runDailyIssuedSummary } from '@/lib/daily-issued-summary-job';

export async function POST(request: NextRequest) {
  try {
    try {
      await requireAdmin({ apiKeyScope: 'admin' });
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
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
