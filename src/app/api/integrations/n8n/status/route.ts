import { NextResponse } from 'next/server';
import { requireSessionRole, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';

const REQUIRED_ROLE = 'viewer' as const;

/** SPEC-081: n8n QLMED aposentado. Autentica e devolve 410 — sem decifrar credencial. */
export async function GET() {
  try {
    await requireSessionRole(REQUIRED_ROLE);
  } catch (e: unknown) {
    if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
    return unauthorizedResponse();
  }
  return NextResponse.json({ error: 'Integração n8n aposentada.' }, { status: 410 });
}
