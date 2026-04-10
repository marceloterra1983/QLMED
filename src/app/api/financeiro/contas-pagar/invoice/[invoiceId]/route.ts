import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleInvoiceGet } from '@/lib/financeiro-shared';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ invoiceId: string }> }
) {
  const { invoiceId } = await params;
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const company = await getOrCreateSingleCompany(userId);
  return handleInvoiceGet(invoiceId, company, 'pagar');
}
