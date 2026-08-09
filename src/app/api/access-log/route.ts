import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { requireAdmin, requireRole } from '@/lib/auth';
import { apiError, apiValidationError } from '@/lib/api-error';
import { accessLogSchema } from '@/lib/schemas/receita';

export async function POST(req: Request) {
  try {
    const { userId } = await requireRole('viewer');

    const body = await req.json();
    const parsed = accessLogSchema.safeParse(body);
    if (!parsed.success) return apiValidationError(parsed.error);

    const { action, path } = parsed.data;

    await prisma.accessLog.create({
      data: { userId, action, path: path || null },
    });

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return apiError(e, 'POST /api/access-log');
  }
}

export async function GET(req: Request) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200);
    const offset = Number(searchParams.get('offset')) || 0;

    const [logs, total] = await Promise.all([
      prisma.accessLog.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: { id: true, action: true, path: true, createdAt: true },
      }),
      prisma.accessLog.count({ where: { userId } }),
    ]);

    return NextResponse.json({ logs, total });
  } catch (e) {
    return apiError(e, 'GET /api/access-log');
  }
}
