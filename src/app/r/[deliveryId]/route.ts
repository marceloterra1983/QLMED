import { NextResponse } from 'next/server';
import {
  DEFAULT_NOTIFICATION_TARGET_PATH,
  normalizePublicBaseUrl,
  recordNotificationClick,
  sanitizeRedirectPath,
} from '@/lib/notification-clicks';
import { createLogger } from '@/lib/logger';
import { checkRateLimit, getRateLimitHeaders, RATE_LIMITS } from '@/lib/rate-limit';
import { getClientIp } from '@/middleware';

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
  // REAUD-B-15: esta rota fica fora do `matcher` do middleware de propósito
  // (é o link público das notificações), então não herdava limite nenhum e
  // gravava um NotificationClick por pedido. O limite vive aqui; pôr `/r` no
  // matcher arrastava-a para a exigência de sessão.
  const limit = checkRateLimit(`${getClientIp(request.headers)}:/r`, RATE_LIMITS.notificationClick);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Muitas tentativas. Tente novamente mais tarde.' },
      { status: 429, headers: getRateLimitHeaders(limit.remaining, limit.resetAt) },
    );
  }

  let targetPath = DEFAULT_NOTIFICATION_TARGET_PATH;

  try {
    const { deliveryId } = await params;
    targetPath = await recordNotificationClick(deliveryId, request.headers);
  } catch (error) {
    log.warn({ err: error }, 'Failed to record notification click');
  }

  return redirectTo(targetPath);
}
