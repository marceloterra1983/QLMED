export {};

/**
 * bootstrap.ts — starts background services once on the server.
 *
 * Imported lazily (dynamic import) from prisma.ts so that:
 *   1. prisma.ts kicks off this module at import time only when DATABASE_URL is set
 *      and QLMED_DISABLE_BACKGROUND_SERVICES is not 'true'
 *   2. sync-scheduler and local-xml-sync share the single PrismaClient from prisma.ts
 *   3. No circular dependency: prisma.ts ➜ (dynamic) bootstrap.ts ➜ sync-scheduler / local-xml-sync ➜ prisma.ts
 */

import { createLogger } from '@/lib/logger';

const log = createLogger('bootstrap');

const globalForBootstrap = globalThis as unknown as {
  __autoSyncStarted?: boolean;
  __localXmlSyncStarted?: boolean;
  __impcgIngestStarted?: boolean;
  __cassemsIngestStarted?: boolean;
  __documentosIngestStarted?: boolean;
  __documentosAlertStarted?: boolean;
  __outboxPurgeStarted?: boolean;
};

if (!globalForBootstrap.__autoSyncStarted) {
  globalForBootstrap.__autoSyncStarted = true;
  setTimeout(() => {
    import('./sync-scheduler')
      .then((m) => m.startAutoSync())
      .catch((err) => log.error({ err }, 'AutoSync falha ao iniciar'));
  }, 10_000);
}

if (!globalForBootstrap.__localXmlSyncStarted) {
  globalForBootstrap.__localXmlSyncStarted = true;
  setTimeout(() => {
    import('./local-xml-sync')
      .then((m) => m.startLocalXmlSync())
      .catch((err) => log.error({ err }, 'LocalXmlSync falha ao iniciar'));
  }, 12_000);
}

if (!globalForBootstrap.__impcgIngestStarted) {
  globalForBootstrap.__impcgIngestStarted = true;
  setTimeout(() => {
    import('./impcg/ingest')
      .then((m) => m.startImpcgMailIngest())
      .catch((err) => log.error({ err }, 'ImpcgMailIngest falha ao iniciar'));
  }, 14_000);
}

if (!globalForBootstrap.__cassemsIngestStarted) {
  globalForBootstrap.__cassemsIngestStarted = true;
  setTimeout(() => {
    import('./cassems/ingest')
      .then((m) => m.startCassemsMailIngest())
      .catch((err) => log.error({ err }, 'CassemsMailIngest falha ao iniciar'));
  }, 16_000);
}

if (!globalForBootstrap.__documentosIngestStarted) {
  globalForBootstrap.__documentosIngestStarted = true;
  setTimeout(() => {
    import('./documentos/ingest')
      .then((m) => m.startDocumentosIngest())
      .catch((err) => log.error({ err }, 'DocumentosIngest falha ao iniciar'));
  }, 20_000);
}

if (!globalForBootstrap.__documentosAlertStarted) {
  globalForBootstrap.__documentosAlertStarted = true;
  setTimeout(() => {
    import('./documentos/alerts')
      .then((m) => m.startDocumentosAlert())
      .catch((err) => log.error({ err }, 'DocumentosAlert falha ao iniciar'));
  }, 22_000);
}

if (!globalForBootstrap.__outboxPurgeStarted) {
  globalForBootstrap.__outboxPurgeStarted = true;
  setTimeout(() => {
    import('./notification-outbox')
      .then((m) => m.startNotificationOutboxPurge())
      .catch((err) => log.error({ err }, 'NotificationOutboxPurge falha ao iniciar'));
  }, 18_000);
}
