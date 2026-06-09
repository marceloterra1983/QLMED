import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKeyScope, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { acknowledgeNotificationDeliveries } from '@/lib/notification-outbox';
import { apiError, apiValidationError } from '@/lib/api-error';

const ackSchema = z.object({
  deliveries: z.array(z.object({
    id: z.string().min(1),
    lockToken: z.string().min(1),
    outcome: z.enum(['sent', 'retry', 'uncertain', 'dead']),
    providerMessageId: z.string().max(500).optional(),
    error: z.string().max(2000).optional(),
  })).min(1).max(100),
});

export async function POST(request: Request) {
  try {
    try {
      await requireApiKeyScope('notifications:dispatch');
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = ackSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const results = await acknowledgeNotificationDeliveries(parsed.data.deliveries);

    return NextResponse.json({
      results,
      accepted: results.filter((result) => result.accepted).length,
      rejected: results.filter((result) => !result.accepted).length,
    });
  } catch (error) {
    return apiError(error, 'notifications/outbox/ack');
  }
}
