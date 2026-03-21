export {};

/**
 * bootstrap.ts — starts background services once on the server.
 *
 * Imported lazily (dynamic import) from prisma.ts so that:
 *   1. prisma.ts has zero side-effects at import time
 *   2. auto-sync and local-xml-sync share the single PrismaClient from prisma.ts
 *   3. No circular dependency: prisma.ts ➜ (dynamic) bootstrap.ts ➜ auto-sync / local-xml-sync ➜ prisma.ts
 */

const globalForBootstrap = globalThis as unknown as {
  __autoSyncStarted?: boolean;
  __localXmlSyncStarted?: boolean;
};

if (!globalForBootstrap.__autoSyncStarted) {
  globalForBootstrap.__autoSyncStarted = true;
  setTimeout(() => {
    import('./auto-sync')
      .then((m) => m.startAutoSync())
      .catch((err) => console.error('[AutoSync] Falha ao iniciar:', err));
  }, 10_000);
}

if (!globalForBootstrap.__localXmlSyncStarted) {
  globalForBootstrap.__localXmlSyncStarted = true;
  setTimeout(() => {
    import('./local-xml-sync')
      .then((m) => m.startLocalXmlSync())
      .catch((err) => console.error('[LocalXmlSync] Falha ao iniciar:', err));
  }, 12_000);
}
