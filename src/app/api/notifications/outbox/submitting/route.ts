import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiKeyScope, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import { markNotificationDeliverySubmitting } from '@/lib/notification-outbox';
import { apiError, apiValidationError } from '@/lib/api-error';

const submittingSchema = z.object({
  id: z.string().min(1),
  lockToken: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    try {
      await requireApiKeyScope('notifications:dispatch');
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = submittingSchema.safeParse(await request.json());
    if (!parsed.success) return apiValidationError(parsed.error);

    const accepted = await markNotificationDeliverySubmitting(parsed.data);
    return NextResponse.json({ accepted }, { status: accepted ? 200 : 409 });
  } catch (error) {
    return apiError(error, 'notifications/outbox/submitting');
  }
}
