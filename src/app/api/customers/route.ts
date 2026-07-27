import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { handleContactList } from '@/lib/contact-shared';
import { createLogger } from '@/lib/logger';
import { apiError, apiValidationError } from '@/lib/api-error';
import { contactListQuerySchema } from '@/lib/schemas/contacts';

const log = createLogger('customers');

export async function GET(req: Request) {
  try {
    let userId: string;
    try {
      userId = await requireAuth();
    } catch {
      return unauthorizedResponse();
    }

    const company = await getOrCreateSingleCompany(userId);
    const { searchParams } = new URL(req.url);
    const parsed = contactListQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);
    return handleContactList(company, 'customer', searchParams);
  } catch (error) {
    return apiError(error, 'customers');
  }
}
