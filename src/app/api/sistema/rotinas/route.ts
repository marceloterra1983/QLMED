import { NextResponse } from 'next/server';
import { requireAuth, unauthorizedResponse } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getBackgroundServiceHealth } from '@/lib/background-service-health';
import { apiError } from '@/lib/api-error';
import {
  SYSTEM_ROUTINES,
  enrichRoutinesWithHealth,
  buildRoutineSummary,
  type EnrichedSystemRoutine,
} from '@/lib/system-routines';

export const dynamic = 'force-dynamic';

export type { EnrichedSystemRoutine };

export async function GET() {
  try {
    await requireAuth();
  } catch {
    return unauthorizedResponse();
  }

  try {
    const health = getBackgroundServiceHealth();
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    const [recentSyncsCount, pendingOutboxCount] = await Promise.all([
      prisma.syncLog.count({
        where: { startedAt: { gte: oneDayAgo } },
      }).catch(() => 0),
      prisma.notificationDelivery.count({
        where: { status: { in: ['pending', 'retry'] } },
      }).catch(() => 0),
    ]);

    const enrichedRoutines = enrichRoutinesWithHealth(health);
    const summary = buildRoutineSummary(SYSTEM_ROUTINES, health, {
      recentSyncs24h: recentSyncsCount,
      pendingOutbox: pendingOutboxCount,
    });

    return NextResponse.json({
      success: true,
      routines: enrichedRoutines,
      backgroundServices: health,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return apiError(error, 'sistema/rotinas');
  }
}
