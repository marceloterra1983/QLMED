import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getBackgroundServiceHealth } from '@/lib/background-service-health';
import { SYSTEM_ROUTINES, type SystemRoutine } from '@/lib/system-routines';

export const dynamic = 'force-dynamic';

export interface EnrichedSystemRoutine extends SystemRoutine {
  liveStatus: 'running' | 'stale' | 'disabled' | 'error' | 'scheduled' | 'worker';
  liveStatusLabel: string;
  lastHeartbeatAt: string | null;
  lastHeartbeatAgeMs: number | null;
  lastError: string | null;
}

export async function GET() {
  try {
    await requireAuth();

    const health = getBackgroundServiceHealth();
    const now = Date.now();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);

    // Métricas operacionais em paralelo
    const [recentSyncsCount, pendingOutboxCount] = await Promise.all([
      prisma.syncLog.count({
        where: { startedAt: { gte: oneDayAgo } },
      }).catch(() => 0),
      prisma.notificationDelivery.count({
        where: { status: { in: ['pending', 'retry'] } },
      }).catch(() => 0),
    ]);

    const enrichedRoutines: EnrichedSystemRoutine[] = SYSTEM_ROUTINES.map((routine) => {
      if (routine.backgroundServiceName) {
        const serviceStatus = health[routine.backgroundServiceName];
        if (serviceStatus) {
          const status = serviceStatus.status;
          const label =
            status === 'running'
              ? 'Ativo (Em Execução)'
              : status === 'stale'
                ? 'Sem Batimento (Stale)'
                : status === 'disabled'
                  ? 'Desativado'
                  : 'Falha / Erro';

          return {
            ...routine,
            liveStatus: status,
            liveStatusLabel: label,
            lastHeartbeatAt: serviceStatus.lastHeartbeatAt,
            lastHeartbeatAgeMs: serviceStatus.lastHeartbeatAgeMs,
            lastError: serviceStatus.lastError,
          };
        }
      }

      const defaultStatus = routine.triggerType === 'worker_cron' ? 'worker' : 'scheduled';
      const defaultLabel = routine.triggerType === 'worker_cron' ? 'Worker do Host' : 'Agendado no Sistema';

      return {
        ...routine,
        liveStatus: defaultStatus,
        liveStatusLabel: defaultLabel,
        lastHeartbeatAt: null,
        lastHeartbeatAgeMs: null,
        lastError: null,
      };
    });

    const activeServicesCount = Object.values(health).filter((h) => h?.status === 'running').length;
    const errorServicesCount = Object.values(health).filter((h) => h?.status === 'error' || h?.status === 'stale').length;

    return NextResponse.json({
      success: true,
      routines: enrichedRoutines,
      backgroundServices: health,
      summary: {
        totalRoutines: enrichedRoutines.length,
        backgroundServicesCount: Object.keys(health).length,
        activeServicesCount,
        errorServicesCount,
        recentSyncs24h: recentSyncsCount,
        pendingOutbox: pendingOutboxCount,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao consultar rotinas';
    return NextResponse.json(
      { success: false, error: message },
      { status: message === 'Unauthorized' ? 401 : 500 },
    );
  }
}
