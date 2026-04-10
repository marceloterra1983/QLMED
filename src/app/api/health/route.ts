import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import prisma from '@/lib/prisma';

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
      process.env.SOURCE_COMMIT ? 'coolify' : undefined,
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

    // Check if authenticated — details only available with valid session
    const session = await getServerSession(authOptions);

    if (integrity && !integrity.healthy) {
      const errorResponse: Record<string, unknown> = {
        status: 'error',
        db: { status: 'connected', latencyMs: dbLatency },
        timestamp: new Date().toISOString(),
      };
      if (session) {
        errorResponse.build = build;
        errorResponse.integrity = integrity;
        errorResponse.error = 'Banco sem dados obrigatórios de produção';
      }
      return NextResponse.json(errorResponse, { status: 503 });
    }

    // Public response: only status, db connectivity, timestamp
    const publicResponse: Record<string, unknown> = {
      status: 'ok',
      db: { status: 'connected', latencyMs: dbLatency },
      timestamp: new Date().toISOString(),
    };

    if (session) {
      // Authenticated response: include build, uptime, memory, integrity
      publicResponse.build = build;
      publicResponse.uptime = process.uptime();
      publicResponse.integrity = integrity;
      publicResponse.memory = {
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      };
    }

    return NextResponse.json(publicResponse);
  } catch (error) {
    const session = await getServerSession(authOptions).catch(() => null);
    const errorResponse: Record<string, unknown> = {
      status: 'error',
      db: { status: 'disconnected' },
      timestamp: new Date().toISOString(),
    };
    if (session) {
      errorResponse.build = build;
      errorResponse.error = error instanceof Error ? error.message : 'Unknown';
    }
    return NextResponse.json(errorResponse, { status: 503 });
  }
}
