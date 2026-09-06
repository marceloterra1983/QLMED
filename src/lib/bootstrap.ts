export {};

/**
 * bootstrap.ts — starts background services once on the server.
 *
 * Imported lazily (dynamic import) from prisma.ts so that:
 *   1. prisma.ts kicks off this module at import time only when DATABASE_URL is set
 *      and QLMED_DISABLE_BACKGROUND_SERVICES is not 'true'
 *   2. sync-scheduler and local-xml-sync share the single PrismaClient from prisma.ts
 *   3. No circular dependency: prisma.ts ➜ (dynamic) bootstrap.ts ➜ sync-scheduler / local-xml-sync ➜ prisma.ts
 *
 * Registra todas as rotinas em segundo plano no BackgroundSupervisor para
 * supervisão coordenada, atraso escalonado (staggered) e parada graciosa.
 */

import { backgroundSupervisor } from '@/lib/background-supervisor';

backgroundSupervisor
  .register({
    name: 'auto-sync',
    description: 'Sincronização SEFAZ / NSDocs / Receita NFS-e',
    delayMs: 10_000,
    start: async () => {
      const { startAutoSync } = await import('./sync-scheduler');
      startAutoSync();
    },
    stop: async () => {
      const { stopAutoSync } = await import('./sync-scheduler');
      stopAutoSync();
    },
  })
  .register({
    name: 'local-xml-sync',
    description: 'Sincronização contínua de XML e backup local/OneDrive',
    delayMs: 12_000,
    start: async () => {
      const { startLocalXmlSync } = await import('./local-xml-sync');
      startLocalXmlSync();
    },
    stop: async () => {
      const { stopLocalXmlSync } = await import('./local-xml-sync');
      await stopLocalXmlSync();
    },
  })
  .register({
    name: 'impcg-mail-ingest',
    description: 'Ingestão de e-mails e ofícios IMPCG',
    delayMs: 14_000,
    start: async () => {
      const { startImpcgMailIngest } = await import('./impcg/ingest');
      await startImpcgMailIngest();
    },
    stop: async () => {
      const { stopImpcgMailIngest } = await import('./impcg/ingest');
      stopImpcgMailIngest();
    },
  })
  .register({
    name: 'cassems-mail-ingest',
    description: 'Ingestão de e-mails e ofícios CASSEMS',
    delayMs: 16_000,
    start: async () => {
      const { startCassemsMailIngest } = await import('./cassems/ingest');
      await startCassemsMailIngest();
    },
    stop: async () => {
      const { stopCassemsMailIngest } = await import('./cassems/ingest');
      stopCassemsMailIngest();
    },
  })
  .register({
    name: 'unimed-cg-mail-ingest',
    description: 'Ingestão de e-mails e autorizações Unimed Campo Grande',
    delayMs: 10_000,
    start: async () => {
      const { startUnimedCgMailIngest } = await import('./unimed-cg/ingest');
      await startUnimedCgMailIngest();
    },
    stop: async () => {
      const { stopUnimedCgMailIngest } = await import('./unimed-cg/ingest');
      stopUnimedCgMailIngest();
    },
  })
  .register({
    name: 'documentos-ingest',
    description: 'Varredura e ingestão de certidões e documentos',
    delayMs: 20_000,
    start: async () => {
      const { startDocumentosIngest } = await import('./documentos/ingest');
      startDocumentosIngest();
    },
    stop: async () => {
      const { stopDocumentosIngest } = await import('./documentos/ingest');
      stopDocumentosIngest();
    },
  })
  .register({
    name: 'documentos-alert',
    description: 'Verificação periódica de vencimento de certidões e alerta WhatsApp',
    delayMs: 22_000,
    start: async () => {
      const { startDocumentosAlert } = await import('./documentos/alerts');
      startDocumentosAlert();
    },
    stop: async () => {
      const { stopDocumentosAlert } = await import('./documentos/alerts');
      stopDocumentosAlert();
    },
  })
  .register({
    name: 'daily-issued-summary',
    description: 'Resumo diário nativo às 18h de notas emitidas',
    delayMs: 24_000,
    start: async () => {
      const { startDailyIssuedSummary } = await import('./daily-issued-summary-job');
      startDailyIssuedSummary();
    },
    stop: async () => {
      const { stopDailyIssuedSummary } = await import('./daily-issued-summary-job');
      stopDailyIssuedSummary();
    },
  })
  .register({
    name: 'notification-outbox-purge',
    description: 'Purga periódica de eventos antigos do Transactional Outbox e dados operacionais',
    delayMs: 18_000,
    start: async () => {
      const { startNotificationOutboxPurge } = await import('./notification-outbox');
      await startNotificationOutboxPurge();
    },
    stop: async () => {
      const { stopNotificationOutboxPurge } = await import('./notification-outbox');
      stopNotificationOutboxPurge();
    },
  });

backgroundSupervisor.startAll();

if (typeof process !== 'undefined' && typeof process.once === 'function') {
  const handleShutdown = async () => {
    try {
      await backgroundSupervisor.stopAll();
    } catch {
      // safe shutdown
    }
  };
  process.once('SIGTERM', () => void handleShutdown());
  process.once('SIGINT', () => void handleShutdown());
}
