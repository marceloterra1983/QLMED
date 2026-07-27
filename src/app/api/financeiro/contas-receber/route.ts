import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleContasGet } from '@/lib/financeiro-shared';
import { financeiroListQuerySchema } from '@/lib/schemas/financeiro';
import { apiValidationError } from '@/lib/api-error';

export async function GET(req: Request) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const { searchParams } = new URL(req.url);
  const parsed = financeiroListQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);

  const company = await getOrCreateSingleCompany(userId);
  return handleContasGet(company, 'receber', searchParams);
}
