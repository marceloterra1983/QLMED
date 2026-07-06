import { NextResponse } from 'next/server';
import {
  DEFAULT_NOTIFICATION_TARGET_PATH,
  normalizePublicBaseUrl,
  recordNotificationClick,
  sanitizeRedirectPath,
} from '@/lib/notification-clicks';
import { createLogger } from '@/lib/logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const log = createLogger('notification-click');

function redirectTo(targetPath: string) {
  const origin = normalizePublicBaseUrl(process.env.NEXTAUTH_URL || process.env.QLMED_PUBLIC_URL);
  const url = new URL(sanitizeRedirectPath(targetPath), origin);
  return NextResponse.redirect(url, {
    status: 302,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ deliveryId: string }> },
) {
  let targetPath = DEFAULT_NOTIFICATION_TARGET_PATH;

  try {
    const { deliveryId } = await params;
    targetPath = await recordNotificationClick(deliveryId, request.headers);
  } catch (error) {
    log.warn({ err: error }, 'Failed to record notification click');
  }

  return redirectTo(targetPath);
}
