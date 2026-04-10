import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createLogger } from '@/lib/logger';

const log = createLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
};

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is required');
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

// Lazy initialization: defer client creation until first access.
// This avoids build-time failures when DATABASE_URL is not set (Docker build stage).
function getLazyPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    return Reflect.get(getLazyPrisma(), prop);
  },
});

// Kick off background services (auto-sync, local-xml-sync) once on the server.
// The dynamic import avoids circular dependencies: bootstrap.ts imports prisma from
// this module, but by the time it resolves the `prisma` export is already available.
if (typeof window === 'undefined' && process.env.DATABASE_URL) {
  import('./bootstrap').catch((err) =>
    log.error({ err }, 'Falha ao iniciar servicos'),
  );
}

export default prisma;
