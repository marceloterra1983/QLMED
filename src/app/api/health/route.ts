import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

function normalizeBuildValue(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

export async function GET() {
  const start = Date.now();
  const requireNonEmptyDb = (process.env.QLMED_REQUIRE_NONEMPTY_DB || 'false').toLowerCase() === 'true';
  const commitSha = normalizeBuildValue(process.env.QLMED_BUILD_COMMIT_SHA);
  const builtAt = normalizeBuildValue(process.env.QLMED_BUILD_DEPLOYED_AT);
  const source =
    normalizeBuildValue(process.env.QLMED_BUILD_SOURCE) ||
    (process.env.NODE_ENV === 'development' ? 'next-dev' : process.env.NODE_ENV || 'unknown');
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

    if (integrity && !integrity.healthy) {
      return NextResponse.json(
        {
          status: 'error',
          build,
          db: { status: 'connected', latencyMs: dbLatency },
          integrity,
          error: 'Banco sem dados obrigatórios de produção',
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      );
    }

    return NextResponse.json({
      status: 'ok',
      build,
      uptime: process.uptime(),
      db: { status: 'connected', latencyMs: dbLatency },
      integrity,
      memory: {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        build,
        db: { status: 'disconnected' },
        error: error instanceof Error ? error.message : 'Unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
