import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, revokeUserSessions } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('auth/logout');

/**
 * Server-side logout. Clients still call NextAuth's `signOut()` to clear
 * the local cookie — this endpoint complements that by incrementing
 * `User.tokenVersion`, which invalidates EVERY outstanding JWT for the
 * user (not just the current device). Useful for "logout from all devices"
 * after a lost laptop or suspected compromise.
 *
 * Also writes an AccessLog(action='logout') entry so the audit trail
 * closes the login→logout loop.
 */
export async function POST() {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    await revokeUserSessions(userId);
    prisma.accessLog
      .create({ data: { userId, action: 'logout' } })
      .catch((err) => log.warn({ err, userId }, 'AccessLog logout write failed'));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'auth/logout');
  }
}
