import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const dbLatency = Date.now() - start;

    return NextResponse.json({
      status: 'ok',
      uptime: process.uptime(),
      db: { status: 'connected', latencyMs: dbLatency },
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
        db: { status: 'disconnected' },
        error: error instanceof Error ? error.message : 'Unknown',
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
