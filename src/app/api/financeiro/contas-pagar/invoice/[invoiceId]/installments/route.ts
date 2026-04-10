import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleInstallmentsPut } from '@/lib/financeiro-shared';
import { apiError } from '@/lib/api-error';

export async function PUT(
  req: Request,
  { params }: { params: { invoiceId: string } }
) {
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  const company = await getOrCreateSingleCompany(userId);
  const body = await req.json();
  return handleInstallmentsPut(params.invoiceId, company, body);
}
