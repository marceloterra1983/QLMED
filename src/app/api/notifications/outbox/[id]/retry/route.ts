import { NextResponse } from 'next/server';
import { requireAdmin, forbiddenResponse, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { z } from 'zod';

const resolutionSchema = z.object({
  action: z.enum(['retry', 'mark_sent']).default('retry'),
  reason: z.string().trim().min(5).max(1000),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    let admin: Awaited<ReturnType<typeof requireAdmin>>;
    try {
      admin = await requireAdmin();
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = resolutionSchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Informe a ação e o motivo da resolução' }, { status: 400 });
    }

    const { id } = await params;
    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.notificationDelivery.updateMany({
        where: {
          id,
          status: { in: ['uncertain', 'dead'] },
        },
        data: parsed.data.action === 'retry'
          ? {
              status: 'retry',
              availableAt: now,
              lockedAt: null,
              lockToken: null,
              submittingAt: null,
              lastError: `Manual retry authorized: ${parsed.data.reason}`,
            }
          : {
              status: 'sent',
              sentAt: now,
              lockedAt: null,
              lockToken: null,
              lastError: `Manually reconciled as sent: ${parsed.data.reason}`,
            },
      });
      if (updated.count === 1) {
        await tx.accessLog.create({
          data: {
            userId: admin.userId,
            action: 'notification_resolved',
            path: `delivery=${id};action=${parsed.data.action};reason=${parsed.data.reason}`,
          },
        });
      }
      return updated;
    });

    if (result.count !== 1) {
      return NextResponse.json(
        { error: 'Entrega não encontrada ou não exige decisão manual' },
        { status: 409 },
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return apiError(error, 'notifications/outbox/[id]/retry');
  }
}
