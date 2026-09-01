import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/prisma';
import { getBackgroundServiceHealth } from '@/lib/background-service-health';

export const dynamic = 'force-dynamic';

function normalizeBuildValue(value: string | undefined): string | null {
  const normalized = value?.trim();

  if (!normalized) {
    return null;
  }

  return ['unknown', 'undefined', 'null', 'n/a'].includes(normalized.toLowerCase()) ? null : normalized;
}

function firstBuildValue(...values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = normalizeBuildValue(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export async function GET() {
  const start = Date.now();
  let authenticated = false;
  const requireNonEmptyDb = (process.env.QLMED_REQUIRE_NONEMPTY_DB || 'false').toLowerCase() === 'true';
  const commitSha = firstBuildValue(
    process.env.QLMED_BUILD_COMMIT_SHA,
    process.env.APP_QLMED_BUILD_COMMIT_SHA,
    process.env.SOURCE_COMMIT,
    process.env.GITHUB_SHA
  );
  const builtAt = firstBuildValue(
    process.env.QLMED_BUILD_DEPLOYED_AT,
    process.env.APP_QLMED_BUILD_DEPLOYED_AT
  );
  const source =
    firstBuildValue(
      process.env.QLMED_BUILD_SOURCE,
      process.env.APP_QLMED_BUILD_SOURCE,
      process.env.SOURCE_COMMIT ? 'legacy-build' : undefined,
      process.env.NODE_ENV === 'development' ? 'next-dev' : process.env.NODE_ENV
    ) || 'unknown';
  const build = {
    commitSha,
    commitShort: commitSha ? commitSha.slice(0, 12) : null,
    builtAt,
    source,
  };

  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;
    const integrity = requireNonEmptyDb
      ? await (async () => {
          const [users, companies] = await Promise.all([
            prisma.user.count(),
            prisma.company.count(),
          ]);

          return {
            users,
            companies,
            healthy: users > 0 && companies > 0,
          };
        })()
      : null;

    // Details require the same active-user and tokenVersion checks as protected routes.
    try {
      await requireAuth();
      authenticated = true;
    } catch {
      authenticated = false;
    }

    if (integrity && !integrity.healthy) {
      const errorResponse: Record<string, unknown> = {
        status: 'error',
        db: { status: 'connected' },
        timestamp: new Date().toISOString(),
      };
      if (authenticated) {
        errorResponse.build = build;
        // REAUD-B-14: a OBS-003 tirou a latência do 200 anónimo e ela tinha
        // ficado neste ramo. É reconhecimento de infra — só com sessão.
        errorResponse.db = { status: 'connected', latencyMs: dbLatency };
        errorResponse.integrity = integrity;
        errorResponse.error = 'Banco sem dados obrigatórios de produção';
      }
      return NextResponse.json(errorResponse, { status: 503 });
    }

    // Resposta pública: só o suficiente para um load balancer decidir se o
    // processo está vivo. O SHA do build e a latência do banco são
    // reconhecimento de versão/infra e passaram para o ramo autenticado
    // (auditoria OBS-003).
    const publicResponse: Record<string, unknown> = {
      status: 'ok',
      db: { status: 'connected' },
      timestamp: new Date().toISOString(),
    };

    if (authenticated) {
      // Authenticated response: add build, db latency, uptime, memory, integrity
      publicResponse.build = build;
      publicResponse.db = { status: 'connected', latencyMs: dbLatency };
      const [outboxCounts, oldestPending] = await Promise.all([
        prisma.notificationDelivery.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
        prisma.notificationDelivery.findFirst({
          where: { status: { in: ['pending', 'retry'] } },
          orderBy: { createdAt: 'asc' },
          select: { createdAt: true },
        }),
      ]);
      publicResponse.uptime = process.uptime();
      publicResponse.integrity = integrity;
      publicResponse.outbox = {
        counts: Object.fromEntries(outboxCounts.map((row) => [row.status, row._count._all])),
        oldestPendingAt: oldestPending?.createdAt.toISOString() || null,
      };
      publicResponse.backgroundServices = getBackgroundServiceHealth();
      publicResponse.memory = {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      };
    }

    return NextResponse.json(publicResponse);
  } catch (error) {
    const errorResponse: Record<string, unknown> = {
      status: 'error',
      db: { status: 'disconnected' },
      timestamp: new Date().toISOString(),
    };
    if (authenticated) {
      errorResponse.build = build;
      errorResponse.error = error instanceof Error ? error.message : 'Unknown';
    }
    return NextResponse.json(errorResponse, { status: 503 });
  }
}
