import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  __autoSyncStarted?: boolean;
};

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Iniciar auto-sync uma única vez no servidor (não durante build nem no cliente)
if (
  typeof window === 'undefined' &&
  !globalForPrisma.__autoSyncStarted
) {
  globalForPrisma.__autoSyncStarted = true;
  setTimeout(() => {
    import('./auto-sync')
      .then(m => m.startAutoSync())
      .catch(err => console.error('[AutoSync] Falha ao iniciar:', err));
  }, 10_000);
}

export default prisma;
