import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKeyScope, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import {
  DEFAULT_OUTBOX_LEASE_SECONDS,
  MAX_OUTBOX_LEASE_SECONDS,
  claimNotificationDeliveries,
} from '@/lib/notification-outbox';
import { apiError, apiValidationError } from '@/lib/api-error';

const claimSchema = z.object({
  workerId: z.string().trim().min(1).max(100),
  invoiceType: z.enum(['NFE', 'CTE']),
  limit: z.number().int().min(1).max(100).default(50),
  leaseSeconds: z.number().int().min(60).max(MAX_OUTBOX_LEASE_SECONDS)
    .default(DEFAULT_OUTBOX_LEASE_SECONDS),
});

export async function POST(request: Request) {
  try {
    try {
      await requireApiKeyScope('notifications:dispatch');
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = claimSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const { workerId, invoiceType, limit, leaseSeconds } = parsed.data;

    const claimed = await claimNotificationDeliveries({ workerId, invoiceType, limit, leaseSeconds });

    return NextResponse.json({ deliveries: claimed });
  } catch (error) {
    return apiError(error, 'notifications/outbox/claim');
  }
}
