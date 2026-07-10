import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { buildOneDriveAuthorizeUrl } from '@/lib/onedrive-client';
import { generateOneDriveOAuthState, ONEDRIVE_OAUTH_STATE_COOKIE, oneDriveOAuthStateCookieOptions } from '@/lib/onedrive-oauth-state';

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

  try {
    const loginHint = request.nextUrl.searchParams.get('loginHint')?.trim() || undefined;
    const state = generateOneDriveOAuthState();
    const url = buildOneDriveAuthorizeUrl({
      loginHint,
      state,
    });

    const response = NextResponse.json({ url });
    response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, state, oneDriveOAuthStateCookieOptions());
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro ao gerar URL de autorização';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
