import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { forbiddenResponse, requireAdmin, unauthorizedResponse } from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  channel: z.enum(['email', 'whatsapp']).optional(),
  recipient: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  try {
    try {
      await requireAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);

    const where: Prisma.NotificationClickWhereInput = {};
    const deliveryWhere: Prisma.NotificationDeliveryWhereInput = {};

    if (parsed.data.channel) deliveryWhere.channel = parsed.data.channel;
    if (parsed.data.recipient) deliveryWhere.recipient = { contains: parsed.data.recipient };
    if (Object.keys(deliveryWhere).length > 0) where.delivery = deliveryWhere;

    const clicks = await prisma.notificationClick.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: parsed.data.limit,
      select: {
        id: true,
        targetPath: true,
        createdAt: true,
        userAgent: true,
        delivery: {
          select: {
            id: true,
            channel: true,
            recipient: true,
            status: true,
            sentAt: true,
            providerMessageId: true,
            event: {
              select: {
                eventKey: true,
                invoice: {
                  select: {
                    id: true,
                    type: true,
                    number: true,
                    accessKey: true,
                    senderName: true,
                    createdAt: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json({ clicks });
  } catch (error) {
    return apiError(error, 'notification-clicks:GET');
  }
}
