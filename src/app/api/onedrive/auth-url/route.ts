import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { buildOneDriveAuthorizeUrl } from '@/lib/onedrive-client';
import { generateOneDriveOAuthState, ONEDRIVE_OAUTH_STATE_COOKIE, oneDriveOAuthStateCookieOptions } from '@/lib/onedrive-oauth-state';
import { apiError, apiValidationError } from '@/lib/api-error';

const authUrlQuerySchema = z.object({
  loginHint: z.string().trim().optional(),
});

export async function GET(request: Request) {
  try {
    await requireAdmin();

    const parsed = authUrlQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);

    const loginHint = parsed.data.loginHint || undefined;
    const state = generateOneDriveOAuthState();
    const url = buildOneDriveAuthorizeUrl({
      loginHint,
      state,
    });

    const response = NextResponse.json({ url });
    response.cookies.set(ONEDRIVE_OAUTH_STATE_COOKIE, state, oneDriveOAuthStateCookieOptions());
    return response;
  } catch (e) {
    return apiError(e, 'GET /api/onedrive/auth-url');
  }
}
