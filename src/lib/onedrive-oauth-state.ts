import { randomBytes, timingSafeEqual } from 'crypto';

export const ONEDRIVE_OAUTH_STATE_COOKIE = 'qlmed_onedrive_oauth_state';
export const ONEDRIVE_OAUTH_STATE_TTL_SECONDS = 10 * 60;

export function generateOneDriveOAuthState() {
  return randomBytes(32).toString('base64url');
}

export function isValidOneDriveOAuthState(received: string | null | undefined, expected: string | null | undefined) {
  const left = received?.trim() || '';
  const right = expected?.trim() || '';
  if (!left || !right || left.length !== right.length || left.length > 128) return false;

  try {
    return timingSafeEqual(Buffer.from(left), Buffer.from(right));
  } catch {
    return false;
  }
}

export function oneDriveOAuthStateCookieOptions() {
  return {
    httpOnly: true,
    maxAge: ONEDRIVE_OAUTH_STATE_TTL_SECONDS,
    path: '/',
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
  };
}
