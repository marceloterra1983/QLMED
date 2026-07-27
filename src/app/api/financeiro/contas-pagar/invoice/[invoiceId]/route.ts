import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleInvoiceGet } from '@/lib/financeiro-shared';
import { idParamSchema } from '@/lib/schemas/common';
import { apiValidationError } from '@/lib/api-error';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;
  const paramsParsed = idParamSchema.safeParse({ id: invoiceId });
  if (!paramsParsed.success) return apiValidationError(paramsParsed.error);

  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  return handleInvoiceGet(invoiceId, company, 'pagar');
}
