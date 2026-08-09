import { createHash } from 'node:crypto';
import type { InvoiceType } from '@prisma/client';
import prisma from '@/lib/prisma';

export const DEFAULT_NOTIFICATION_TARGET_PATH = '/fiscal/invoices';
const MAX_USER_AGENT_LENGTH = 500;

export function resolveNotificationTargetPath(invoiceType: InvoiceType | null | undefined): string {
  return invoiceType === 'CTE' ? '/fiscal/cte' : DEFAULT_NOTIFICATION_TARGET_PATH;
}

export function sanitizeRedirectPath(path: string | null | undefined): string {
  const value = path?.trim();
  if (!value || !value.startsWith('/') || value.startsWith('//') || /[\x00-\x1F\x7F]/.test(value)) {
    return DEFAULT_NOTIFICATION_TARGET_PATH;
  }
  return value;
}

export function normalizePublicBaseUrl(baseUrl: string | null | undefined): string {
  const value = baseUrl?.trim().replace(/\/+$/, '');
  return value || 'https://app.qlmed.com.br';
}

export function getClientIp(headers: Headers): string | null {
  const direct =
    headers.get('cf-connecting-ip') ||
    headers.get('x-real-ip') ||
    headers.get('x-forwarded-for');
  const first = direct?.split(',')[0]?.trim();
  return first || null;
}

function hashClickIp(ip: string | null): string | null {
  if (!ip) return null;
  const salt = process.env.NOTIFICATION_CLICK_HASH_SALT || process.env.NEXTAUTH_SECRET || 'qlmed-notification-click';
  return createHash('sha256').update(`${salt}\0${ip}`, 'utf8').digest('hex');
}

function truncateHeader(value: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, MAX_USER_AGENT_LENGTH) : null;
}

export async function recordNotificationClick(deliveryId: string, headers: Headers): Promise<string> {
  const normalizedDeliveryId = deliveryId.trim();
  if (!normalizedDeliveryId || normalizedDeliveryId.length > 200) {
    return DEFAULT_NOTIFICATION_TARGET_PATH;
  }

  const delivery = await prisma.notificationDelivery.findUnique({
    where: { id: normalizedDeliveryId },
    select: {
      id: true,
      event: {
        select: {
          invoice: { select: { type: true } },
        },
      },
    },
  });

  const targetPath = resolveNotificationTargetPath(delivery?.event.invoice.type);
  if (!delivery) return targetPath;

  await prisma.notificationClick.create({
    data: {
      deliveryId: delivery.id,
      targetPath,
      userAgent: truncateHeader(headers.get('user-agent')),
      ipHash: hashClickIp(getClientIp(headers)),
    },
  });

  return targetPath;
}
