import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKeyScope, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';
import { dispatchInvoicePush } from '@/lib/web-push';

const pushSchema = z.object({
  id: z.string().trim().min(1),
  lockToken: z.string().trim().min(1),
});

export async function POST(request: Request) {
  try {
    try {
      await requireApiKeyScope('notifications:dispatch');
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = pushSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const delivery = await prisma.notificationDelivery.findFirst({
      where: {
        id: parsed.data.id,
        lockToken: parsed.data.lockToken,
        status: 'processing',
        channel: 'push',
      },
      select: {
        id: true,
        recipient: true,
        event: {
          select: {
            invoice: {
              select: { type: true, number: true, senderName: true },
            },
          },
        },
      },
    });

    if (!delivery || (delivery.event.invoice.type !== 'NFE' && delivery.event.invoice.type !== 'CTE')) {
      return NextResponse.json({ outcome: 'failed', error: 'delivery not claimable' }, { status: 409 });
    }

    const subscription = await prisma.pushSubscription.findUnique({
      where: { endpoint: delivery.recipient },
      select: { endpoint: true, p256dh: true, auth: true },
    });

    if (!subscription) {
      return NextResponse.json({ outcome: 'gone' });
    }

    const result = await dispatchInvoicePush({
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      invoice: {
        type: delivery.event.invoice.type,
        number: delivery.event.invoice.number,
        senderName: delivery.event.invoice.senderName,
      },
      deliveryId: delivery.id,
    });

    return NextResponse.json(result);
  } catch (error) {
    return apiError(error, 'notifications/outbox/push');
  }
}
