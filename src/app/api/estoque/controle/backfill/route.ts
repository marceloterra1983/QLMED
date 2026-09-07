import { NextResponse } from 'next/server';
import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { apiError } from '@/lib/api-error';
import { backfillStockLedger } from '@/lib/stock-ledger';
import { createLogger } from '@/lib/logger';

const log = createLogger('estoque/controle/backfill');

export async function POST() {
  try {
    let userId: string;
    try {
      ({ userId } = await requireEditor());
    } catch (err) {
      if (err instanceof Error && err.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }
    const company = await getOrCreateSingleCompany(userId);
    const result = await backfillStockLedger(company.id, userId);
    log.info({ companyId: company.id, ...result }, 'backfill estoque concluído');
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return apiError(error, 'estoque/controle/backfill');
  }
}
