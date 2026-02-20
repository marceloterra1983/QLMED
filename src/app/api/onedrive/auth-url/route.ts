import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import { buildOneDriveAuthorizeUrl } from '@/lib/onedrive-client';

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
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
