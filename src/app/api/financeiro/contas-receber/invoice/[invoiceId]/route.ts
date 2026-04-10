import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleInvoiceGet } from '@/lib/financeiro-shared';

export async function GET(
  req: Request,
  { params }: { params: { invoiceId: string } }
) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  return handleInvoiceGet(params.invoiceId, company, 'receber');
}
