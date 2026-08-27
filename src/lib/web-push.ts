import webpush from 'web-push';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';

const log = createLogger('web-push');

export interface InvoicePushSource {
  type: 'NFE' | 'CTE';
  number: string | null;
  senderName: string | null;
}

export interface InvoicePushPayload {
  title: string;
  body: string;
  url: string;
}

type EnvMap = Record<string, string | undefined>;

export function isWebPushConfigured(env: EnvMap = process.env): boolean {
  return Boolean(env.VAPID_PUBLIC_KEY?.trim() && env.VAPID_PRIVATE_KEY?.trim());
}

export function getVapidPublicKey(env: EnvMap = process.env): string | null {
  const value = env.VAPID_PUBLIC_KEY?.trim();
  return value || null;
}

function getVapidDetails(env: EnvMap = process.env) {
  const publicKey = env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = env.VAPID_PRIVATE_KEY?.trim();
  if (!publicKey || !privateKey) return null;
  const subject = env.VAPID_SUBJECT?.trim() || 'mailto:faturamento@qlmed.com.br';
  return { subject, publicKey, privateKey };
}

export function buildInvoicePushPayload(
  invoice: InvoicePushSource,
  deliveryId: string,
): InvoicePushPayload {
  const isNfe = invoice.type === 'NFE';
  const title = isNfe ? 'QLMED — nova NF-e' : 'QLMED — novo CT-e';
  const sender = invoice.senderName?.trim() || 'Emitente';
  const number = invoice.number?.trim() || '-';
  return {
    title,
    body: `${sender} • nº ${number}`,
    url: `/r/${deliveryId}`,
  };
}

export function assertSafePushPayload(payload: InvoicePushPayload): void {
  const blob = `${payload.title}\n${payload.body}\n${payload.url}`;
  if (/\b\d{44}\b/.test(blob) || /<\?xml|nfeProc|infNFe/i.test(blob)) {
    throw new Error('Push payload must not include fiscal XML or access key');
  }
}

export type PushDispatchOutcome = 'sent' | 'gone' | 'failed';

export async function dispatchInvoicePush(input: {
  endpoint: string;
  p256dh: string;
  auth: string;
  invoice: InvoicePushSource;
  deliveryId: string;
}): Promise<{ outcome: PushDispatchOutcome; providerMessageId?: string; error?: string }> {
  const vapid = getVapidDetails();
  if (!vapid) {
    return { outcome: 'failed', error: 'VAPID is not configured' };
  }

  const payload = buildInvoicePushPayload(input.invoice, input.deliveryId);
  assertSafePushPayload(payload);

  try {
    const result = await webpush.sendNotification(
      {
        endpoint: input.endpoint,
        keys: { p256dh: input.p256dh, auth: input.auth },
      },
      JSON.stringify(payload),
      { vapidDetails: vapid, TTL: 60 * 60, timeout: 15_000 },
    );
    return {
      outcome: 'sent',
      providerMessageId: String(result.statusCode),
    };
  } catch (error) {
    if (error instanceof webpush.WebPushError) {
      if (error.statusCode === 404 || error.statusCode === 410) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: input.endpoint },
        });
        return { outcome: 'gone', error: 'subscription gone' };
      }
      log.warn({ statusCode: error.statusCode }, 'Web push provider rejected delivery');
      return { outcome: 'failed', error: `provider ${error.statusCode}` };
    }
    log.warn({ err: error }, 'Web push send failed');
    return { outcome: 'failed', error: 'provider outcome unknown' };
  }
}
