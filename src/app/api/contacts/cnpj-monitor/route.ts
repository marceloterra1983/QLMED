import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { runBatchCnpjCheck, getRecentCnpjChanges } from '@/lib/cnpj-monitor';
import { cnpjMonitorSchema } from '@/lib/schemas/contacts';
import { withAuth } from '@/lib/with-auth';
import { apiValidationError } from '@/lib/api-error';

export const POST = withAuth({ role: 'editor' }, async (req, { userId }) => {
  const company = await getOrCreateSingleCompany(userId);

  let batchSize = 10;
  const body = await req.json().catch(() => ({}));
  const parsed = cnpjMonitorSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);
  batchSize = parsed.data.batchSize;

  const result = await runBatchCnpjCheck(company.id, batchSize);
  return NextResponse.json({ ok: true, ...result });
});

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
