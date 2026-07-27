import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { createLogger } from '@/lib/logger';

const log = createLogger('users/pending-count');
const noBodySchema = z.object({}).optional();

export async function GET() {
  noBodySchema.safeParse({});
  try {
    try {
      await requireAdmin();
    } catch (e: unknown) {
      if (e instanceof Error && e.message === 'FORBIDDEN') return forbiddenResponse();
      return unauthorizedResponse();
    }

    const count = await prisma.user.count({
      where: { status: 'pending' },
    });

    return NextResponse.json({ count });
  } catch (error) {
    return apiError(error, 'users/pending-count');
  }
}
