import { requireEditor, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleInstallmentsPut } from '@/lib/financeiro-shared';
import { apiError, apiValidationError } from '@/lib/api-error';
import { installmentsSchema } from '@/lib/schemas/financeiro';
import { idParamSchema } from '@/lib/schemas/common';

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;
  let userId: string;
  try {
    const auth = await requireEditor();
    userId = auth.userId;
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  const paramsParsed = idParamSchema.safeParse({ id: invoiceId });
  if (!paramsParsed.success) return apiValidationError(paramsParsed.error);

  const company = await getOrCreateSingleCompany(userId);
  const body = await req.json();
  const parsed = installmentsSchema.safeParse(body);
  if (!parsed.success) return apiValidationError(parsed.error);

  return handleInstallmentsPut(invoiceId, company, body);
}
