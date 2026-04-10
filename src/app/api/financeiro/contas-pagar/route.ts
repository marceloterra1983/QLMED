import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleContasGet } from '@/lib/financeiro-shared';

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  const { searchParams } = new URL(req.url);
  return handleContasGet(company, 'pagar', searchParams);
}
