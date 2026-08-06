import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';

/**
 * Legacy GET /api/products removed (on-request XML aggregation).
 * Use GET /api/products/list (ProductRegistry aggregates).
 */
export async function GET() {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  return NextResponse.json(
    {
      error: 'Rota descontinuada. Use GET /api/products/list',
      code: 'GONE',
    },
    {
      status: 410,
      headers: { 'X-Deprecated': 'Use /api/products/list instead' },
    },
  );
}
