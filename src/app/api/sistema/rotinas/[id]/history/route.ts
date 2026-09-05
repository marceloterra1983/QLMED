import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse, forbiddenResponse } from '@/lib/auth';
import { canAccessPage } from '@/lib/navigation';
import prisma from '@/lib/prisma';
import { apiError } from '@/lib/api-error';
import { SYSTEM_ROUTINES } from '@/lib/system-routines';
import { routineHistoryQuery } from '@/lib/rotinas-history';

export const dynamic = 'force-dynamic';

const HISTORY_LIMIT = 40;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  let userId: string;
  try {
    userId = await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true, allowedPages: true },
  });
  if (!user) return unauthorizedResponse();
  if (!canAccessPage(user.role, user.allowedPages, '/sistema/rotinas')) {
    return forbiddenResponse();
  }

  try {
    const { id } = await context.params;
    const routine = SYSTEM_ROUTINES.find((r) => r.id === id);
    if (!routine) {
      return NextResponse.json({ error: 'Rotina não encontrada' }, { status: 404 });
    }

    const query = routineHistoryQuery(id);
    if (query.source === 'none' || !query.syncMethods) {
      return NextResponse.json({
        success: true,
        routineId: id,
        source: query.source,
        unavailableReason: query.unavailableReason,
        items: [],
      });
    }

    const logs = await prisma.syncLog.findMany({
      where: { syncMethod: { in: query.syncMethods } },
      orderBy: { startedAt: 'desc' },
      take: HISTORY_LIMIT,
      select: {
        id: true,
        syncMethod: true,
        status: true,
        newDocs: true,
        updatedDocs: true,
        skippedDocs: true,
        errorMessage: true,
        startedAt: true,
        completedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      routineId: id,
      source: query.source,
      unavailableReason: null,
      items: logs.map((log) => ({
        id: log.id,
        syncMethod: log.syncMethod,
        status: log.status,
        newDocs: log.newDocs,
        updatedDocs: log.updatedDocs,
        skippedDocs: log.skippedDocs,
        errorMessage: log.errorMessage,
        startedAt: log.startedAt.toISOString(),
        completedAt: log.completedAt ? log.completedAt.toISOString() : null,
      })),
    });
  } catch (error) {
    return apiError(error, 'sistema/rotinas/history');
  }
}
