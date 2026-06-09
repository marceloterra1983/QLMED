import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError, apiValidationError } from '@/lib/api-error';

const querySchema = z.object({
  status: z.enum(['pending', 'processing', 'sent', 'retry', 'uncertain', 'dead'])
    .optional()
    .default('uncertain'),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50),
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

    const deliveries = await prisma.notificationDelivery.findMany({
      where: { status: parsed.data.status },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: parsed.data.limit,
      include: {
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
    });
    return NextResponse.json({ deliveries });
  } catch (error) {
    return apiError(error, 'notifications/outbox:GET');
  }
}
