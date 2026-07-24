import { NextRequest, NextResponse } from 'next/server';
import { searchNcmSorted } from '@/lib/ncm-lookup';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { cacheHeaders } from '@/lib/cache-headers';

export async function GET(request: NextRequest) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const q = request.nextUrl.searchParams.get('q') || '';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20;

  if (q.trim().length < 2) {
    return NextResponse.json([], { headers: cacheHeaders('lookup') });
  }

  const company = await getOrCreateSingleCompany(userId);
  const results = await searchNcmSorted(q.trim(), company.id, limit);
  return NextResponse.json(results, { headers: cacheHeaders('lookup') });
}
