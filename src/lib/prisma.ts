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
    // During build (no DB available), return a client that will fail at query time, not import time
    return new PrismaClient();
  }
  const adapter = new PrismaPg(connectionString);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Kick off background services (auto-sync, local-xml-sync) once on the server.
// The dynamic import avoids circular dependencies: bootstrap.ts imports prisma from
// this module, but by the time it resolves the `prisma` export is already available.
if (typeof window === 'undefined') {
  import('./bootstrap').catch((err) =>
    log.error({ err }, 'Falha ao iniciar servicos'),
  );
}

export default prisma;
