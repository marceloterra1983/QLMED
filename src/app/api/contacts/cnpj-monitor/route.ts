import { NextResponse } from 'next/server';
import { requireAuth, requireEditor, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { runBatchCnpjCheck, getRecentCnpjChanges } from '@/lib/cnpj-monitor';
import { cnpjMonitorSchema } from '@/lib/schemas/contacts';
import { apiError, apiValidationError } from '@/lib/api-error';

export async function POST(req: Request) {
  try {
    const { userId } = await requireEditor();
    const company = await getOrCreateSingleCompany(userId);

    const body = await req.json().catch(() => ({}));
    const parsed = cnpjMonitorSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const result = await runBatchCnpjCheck(company.id, parsed.data.batchSize);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return apiError(e, 'POST /api/contacts/cnpj-monitor');
  }
}

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const changes = await getRecentCnpjChanges(company.id);
  return NextResponse.json({ changes });
}
