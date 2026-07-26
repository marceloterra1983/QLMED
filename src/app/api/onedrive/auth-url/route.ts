import { NextResponse } from 'next/server';
import { buildOneDriveAuthorizeUrl } from '@/lib/onedrive-client';
import { generateOneDriveOAuthState, ONEDRIVE_OAUTH_STATE_COOKIE, oneDriveOAuthStateCookieOptions } from '@/lib/onedrive-oauth-state';
import { withAuth } from '@/lib/with-auth';

export const GET = withAuth({ role: 'admin' }, async (request) => {
  const loginHint = new URL(request.url).searchParams.get('loginHint')?.trim() || undefined;
  const state = generateOneDriveOAuthState();
  const url = buildOneDriveAuthorizeUrl({
    loginHint,
    state,
  });

  const response = NextResponse.json({ url });
  response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, state, oneDriveOAuthStateCookieOptions());
  return response;
});
