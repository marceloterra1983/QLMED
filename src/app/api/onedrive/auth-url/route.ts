import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { buildOneDriveAuthorizeUrl } from '@/lib/onedrive-client';
import { apiError } from '@/lib/api-error';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  try {
    const loginHint = request.nextUrl.searchParams.get('loginHint')?.trim() || undefined;
    const url = buildOneDriveAuthorizeUrl({
      loginHint,
      state: `qlmed-${Date.now()}`,
    });

    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar URL de autorização';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
