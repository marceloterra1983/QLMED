import { NextResponse } from 'next/server';
import { z } from 'zod';
import { forbiddenResponse, requireApiKeyScope, unauthorizedResponse } from '@/lib/auth';
import { apiError } from '@/lib/api-error';
import { apiValidationError } from '@/lib/api-error';
import prisma from '@/lib/prisma';

const querySchema = z.object({
  invoiceType: z.enum(['NFE', 'CTE']),
});

export async function GET(request: Request) {
  try {
    try {
      await requireApiKeyScope('notifications:dispatch');
      await requireApiKeyScope('notifications:assets');
    } catch (error) {
      if (error instanceof Error && error.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return apiValidationError(parsed.error);

    const invoice = await prisma.invoice.findFirst({
      where: { type: parsed.data.invoiceType, direction: 'received' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true },
    });
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({ ok: true, invoiceId: invoice?.id ?? null });
  } catch (error) {
    return apiError(error, 'notifications/outbox/smoke');
  }
}
