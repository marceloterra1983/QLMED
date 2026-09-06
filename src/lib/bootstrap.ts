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
  })
  .register({
    name: 'local-xml-sync',
    description: 'Sincronização contínua de XML e backup local/OneDrive',
    delayMs: 12_000,
    start: async () => {
      const { startLocalXmlSync } = await import('./local-xml-sync');
      startLocalXmlSync();
    },
  })
  .register({
    name: 'impcg-mail-ingest',
    description: 'Ingestão de e-mails e ofícios IMPCG',
    delayMs: 14_000,
    start: async () => {
      const { startImpcgMailIngest } = await import('./impcg/ingest');
      startImpcgMailIngest();
    },
  })
  .register({
    name: 'cassems-mail-ingest',
    description: 'Ingestão de e-mails e ofícios CASSEMS',
    delayMs: 16_000,
    start: async () => {
      const { startCassemsMailIngest } = await import('./cassems/ingest');
      startCassemsMailIngest();
    },
  })
  .register({
    name: 'unimed-cg-mail-ingest',
    description: 'Ingestão de e-mails e autorizações Unimed Campo Grande',
    delayMs: 10_000,
    start: async () => {
      const { startUnimedCgMailIngest } = await import('./unimed-cg/ingest');
      startUnimedCgMailIngest();
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
  })
  .register({
    name: 'documentos-alert',
    description: 'Verificação periódica de vencimento de certidões e alerta WhatsApp',
    delayMs: 22_000,
    start: async () => {
      const { startDocumentosAlert } = await import('./documentos/alerts');
      startDocumentosAlert();
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
  })
  .register({
    name: 'notification-outbox-purge',
    description: 'Purga periódica de eventos antigos do Transactional Outbox',
    delayMs: 18_000,
    start: async () => {
      const { startNotificationOutboxPurge } = await import('./notification-outbox');
      startNotificationOutboxPurge();
    },
  });

backgroundSupervisor.startAll();
