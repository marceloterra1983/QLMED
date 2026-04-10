import { NextRequest, NextResponse } from 'next/server';
import { searchNcm, searchNcmSorted } from '@/lib/ncm-lookup';
import { requireAuth } from '@/lib/auth';
import { getOrCreateSingleCompany } from '@/lib/single-company';
import { cacheHeaders } from '@/lib/cache-headers';

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get('q') || '';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 20, 50) : 20;

  if (q.trim().length < 2) {
    return NextResponse.json([], { headers: cacheHeaders('lookup') });
  }

  // Try to get company context for sorted results (most-used first)
  try {
    const userId = await requireAuth();
    const company = await getOrCreateSingleCompany(userId);
    const results = await searchNcmSorted(q.trim(), company.id, limit);
    return NextResponse.json(results, { headers: cacheHeaders('lookup') });
  } catch {
    // Fallback without sorting if auth fails
    const results = await searchNcm(q.trim(), limit);
    return NextResponse.json(results, { headers: cacheHeaders('lookup') });
  }
}
