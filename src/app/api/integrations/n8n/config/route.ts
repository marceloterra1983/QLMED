import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

/** SPEC-081: n8n QLMED aposentado. Autentica e devolve 410 — sem ler/gravar token. */
export async function GET(_request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }
  return NextResponse.json({ error: 'Integração n8n aposentada.' }, { status: 410 });
}

export async function PUT(_request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }
  return NextResponse.json({ error: 'Integração n8n aposentada.' }, { status: 410 });
}
