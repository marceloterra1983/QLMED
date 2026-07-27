import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { searchNcmSorted } from '@/lib/ncm-lookup';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { cacheHeaders } from '@/lib/cache-headers';
import { apiValidationError } from '@/lib/api-error';

const ncmSearchQuerySchema = z.object({
  q: z.string().optional().default(''),
  limit: z.coerce.number().int().positive().max(50).optional().default(20),
});

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const parsed = ncmSearchQuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return apiValidationError(parsed.error);

  const q = parsed.data.q;
  const limit = parsed.data.limit;

  if (q.trim().length < 2) {
    return NextResponse.json([], { headers: cacheHeaders('lookup') });
  }

  const company = await getOrCreateSingleCompany(userId);
  const results = await searchNcmSorted(q.trim(), company.id, limit);
  return NextResponse.json(results, { headers: cacheHeaders('lookup') });
}
