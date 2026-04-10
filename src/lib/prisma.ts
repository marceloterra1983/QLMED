import { PrismaClient } from '@prisma/client';
import { createLogger } from '@/lib/logger';

const log = createLogger('prisma');

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

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
