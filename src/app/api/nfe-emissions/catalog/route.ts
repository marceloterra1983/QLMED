import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { listSaidaOperations } from '@/lib/nfe-emission/operations';

export async function GET() {
  try {
    await requireAuth();
    return NextResponse.json({ operations: listSaidaOperations() });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') return unauthorizedResponse();
    return apiError(error, 'GET /api/nfe-emissions/catalog');
  }
}
