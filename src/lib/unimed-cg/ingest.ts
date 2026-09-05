import { createLogger } from '@/lib/logger';
import {
  deleteOneDriveItem,
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  uploadOneDriveFile,
} from '@/lib/onedrive-client';
import {
  GraphMailboxError,
  getMailboxMessageBodyHtml,
  listMailboxMessagesBySenderWithoutAttachments,
  type ImpcgMailMessage,
} from '@/lib/graph-mail-client';
import { acquirePostgresAdvisoryLock, unimedCgMailIngestLockKey } from '@/lib/postgres-advisory-lock';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';
import { getSingleCompany } from '@/lib/single-company';
import { assertAllowedHost } from '@/lib/http-allowlist';
import { renderUrlToPdf } from '@/lib/pdf/render-url';
import {
  UNIMED_CG_INGEST_INTERVAL_MS,
  UNIMED_CG_MAILBOXES,
  UNIMED_CG_ONEDRIVE_FOLDER,
  UNIMED_CG_OPME_HOSTS,
  UNIMED_CG_SENDER_EMAIL,
} from './constants';
import { resolveUnimedCgOneDrive } from './onedrive';
import {
  buildDeliveryFileName,
  buildFileName,
  extractCliqueAquiUrl,
  extractProcessIdFromSubject,
  isUnimedCgEntregaSubject,
  isUnimedCgFaturamentoSubject,
  parseAuthorizationPageHtml,
  parseDeliveryPageHtml,
  shouldUpgrade,
} from './parse-page';
import { prismaUnimedCgDeliveryStore } from './delivery-store';
import { prismaUnimedCgStore } from './store';
import {
  isWithinUnimedCgNotifyWindow,
  notifyUnimedCgAuthorization,
  notifyUnimedCgDelivery,
  resolveUnimedCgWhatsAppTarget,
  type UnimedCgWhatsAppTarget,
} from './whatsapp-notify';

const log = createLogger('unimed-cg/ingest');

export type UnimedCgMailPort = {
  listMessages(mailbox: string, options?: { signal?: AbortSignal }): Promise<ImpcgMailMessage[]>;
  getBodyHtml(
    mailbox: string,
    graphMessageId: string,
    options?: { signal?: AbortSignal },
  ): Promise<{ contentType: string; content: string }>;
};

export type UnimedCgDrivePort = {
  uploadPdf(input: { fileName: string; content: Buffer }): Promise<{ itemId: string }>;
  deletePdf?(itemId: string): Promise<void>;
};

export type UnimedCgFetchPort = {
  fetchHtml(url: string): Promise<string>;
  renderPdf(url: string): Promise<Buffer>;
};

export type UnimedCgAuthorizationRow = {
  id: string;
  processId: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  oneDriveItemId: string;
};

export type PersistArgs = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  location: string | null;
  totalCents: number;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistDeliveryArgs = {
  companyId: string;
  processId: string;
  principalAuthorization: string | null;
  status: string | null;
  authorizedAt: Date | null;
  supplier: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type UnimedCgStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(companyId: string, processId: string): Promise<UnimedCgAuthorizationRow | null>;
  persistConfirmed(input: PersistArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistArgs & { authorizationId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    authorizationId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  loadIngestState(companyId: string): Promise<{
    lastSuccessAt: Date | null;
    backfillCompletedAt: Date | null;
    lastError: string | null;
  } | null>;
  saveIngestState(
    companyId: string,
    patch: { lastSuccessAt?: Date | null; backfillCompletedAt?: Date | null; lastError?: string | null },
  ): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgDeliveryStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(companyId: string, processId: string): Promise<UnimedCgAuthorizationRow | null>;
  persistConfirmed(input: PersistDeliveryArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistDeliveryArgs & { authorizationId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    authorizationId: string;
    mailbox: string;
    graphMessageId: string;
    internetMessageId: string;
    receivedAt: Date;
  }): Promise<void>;
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type UnimedCgIngestResult = {
  ok: boolean;
  busy?: boolean;
  processed: number;
  skipped: number;
  failedUploads: number;
  failedPersists: number;
  failedMailboxes: string[];
  lastCollectedAt: string | null;
};

export type UnimedCgIngestDeps = {
  mail: UnimedCgMailPort;
  drive: UnimedCgDrivePort;
  fetch: UnimedCgFetchPort;
  store: UnimedCgStorePort;
  deliveryStore: UnimedCgDeliveryStorePort;
  whatsapp?: UnimedCgWhatsAppTarget | null;
};

function sanitizeError(message: string): string {
  return message
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .replace(/eyJ[a-zA-Z0-9_-]{10,}/g, '[token]')
    .slice(0, 500);
}

function mailboxLabel(upn: string): string {
  const local = upn.split('@')[0]?.trim();
  return local || 'caixa';
}

function defaultMailPort(): UnimedCgMailPort {
  return {
    listMessages: (mailbox, options) =>
      listMailboxMessagesBySenderWithoutAttachments(mailbox, UNIMED_CG_SENDER_EMAIL, options),
    getBodyHtml: (mailbox, graphMessageId, options) =>
      getMailboxMessageBodyHtml(mailbox, graphMessageId, options),
  };
}

async function defaultDrivePort(companyId: string): Promise<UnimedCgDrivePort> {
  const { accessToken, driveId } = await resolveUnimedCgOneDrive(companyId);
  await ensureOneDriveFolder(accessToken, driveId, UNIMED_CG_ONEDRIVE_FOLDER);
  return {
    async uploadPdf(input) {
      const uploaded = await uploadOneDriveFile(
        accessToken,
        driveId,
        UNIMED_CG_ONEDRIVE_FOLDER,
        input.fileName,
        input.content,
      );
      return { itemId: uploaded.id };
    },
    async deletePdf(itemId) {
      await deleteOneDriveItem(accessToken, driveId, itemId);
    },
  };
}

function defaultFetchPort(): UnimedCgFetchPort {
  return {
    async fetchHtml(url) {
      const allowed = assertAllowedHost(url, UNIMED_CG_OPME_HOSTS);
      const response = await fetch(allowed.toString(), {
        cache: 'no-store',
        signal: AbortSignal.timeout(30_000),
        headers: { Accept: 'text/html,application/xhtml+xml' },
      });
      if (!response.ok) {
        throw new Error(`fetch OPME ${response.status}`);
      }
      return response.text();
    },
    async renderPdf(url) {
      return renderUrlToPdf(url, UNIMED_CG_OPME_HOSTS);
    },
  };
}

export async function downloadUnimedCgPdf(companyId: string, itemId: string): Promise<Buffer> {
  const { accessToken, driveId } = await resolveUnimedCgOneDrive(companyId);
  return downloadOneDriveItemContent(accessToken, driveId, itemId);
}

export async function createDefaultUnimedCgDeps(companyId: string): Promise<UnimedCgIngestDeps> {
  return {
    mail: defaultMailPort(),
    drive: await defaultDrivePort(companyId),
    fetch: defaultFetchPort(),
    store: prismaUnimedCgStore,
    deliveryStore: prismaUnimedCgDeliveryStore,
  };
}

type UnimedCgRunOptions = Partial<UnimedCgIngestDeps> & {
  companyId: string;
};

export async function runUnimedCgIngest(
  input: string | UnimedCgRunOptions,
  deps?: Partial<UnimedCgIngestDeps>,
): Promise<UnimedCgIngestResult> {
  const options: UnimedCgRunOptions = typeof input === 'string'
    ? { companyId: input, ...deps }
    : { ...deps, ...input };
  const companyId = options.companyId;

  const lock = await acquirePostgresAdvisoryLock(unimedCgMailIngestLockKey(companyId));
  if (!lock) {
    return {
      ok: false,
      busy: true,
      processed: 0,
      skipped: 0,
      failedUploads: 0,
      failedPersists: 0,
      failedMailboxes: [],
      lastCollectedAt: null,
    };
  }

  const resolved: UnimedCgIngestDeps = {
    mail: options.mail ?? defaultMailPort(),
    drive: options.drive ?? await defaultDrivePort(companyId),
    fetch: options.fetch ?? defaultFetchPort(),
    store: options.store ?? prismaUnimedCgStore,
    deliveryStore: options.deliveryStore ?? prismaUnimedCgDeliveryStore,
    whatsapp: options.whatsapp !== undefined ? options.whatsapp : resolveUnimedCgWhatsAppTarget(),
  };

  let processed = 0;
  let skipped = 0;
  let failedUploads = 0;
  let failedPersists = 0;
  const failedMailboxes: string[] = [];
  const errors: string[] = [];
  const notifyAttempted = new Set<string>();

  const collectOrphanUpload = async (itemId: string, referencedItemId: string | null) => {
    if (referencedItemId === itemId) return;
    if (!resolved.drive.deletePdf) {
      errors.push('PDF órfão no OneDrive sem coleta');
      log.warn('unimed_cg_orphan_pdf_uncollected');
      return;
    }
    try {
      await resolved.drive.deletePdf(itemId);
      log.warn('unimed_cg_orphan_pdf_collected');
    } catch (error) {
      errors.push(sanitizeError(error instanceof Error ? error.message : 'coleta de órfão'));
      log.warn('unimed_cg_orphan_pdf_collect_failed');
    }
  };

  try {
    for (const mailbox of UNIMED_CG_MAILBOXES) {
      let messages: ImpcgMailMessage[] = [];
      try {
        messages = await resolved.mail.listMessages(mailbox, {});
      } catch (error) {
        const label = mailboxLabel(mailbox);
        failedMailboxes.push(label);
        const status = error instanceof GraphMailboxError ? error.status : 0;
        errors.push(status === 403
          ? `leitura de caixa falhou (${status})`
          : sanitizeError(error instanceof Error ? error.message : 'falha na caixa'));
        log.warn({ mailbox: label, status: status || undefined }, 'unimed_cg_mailbox_failed');
        continue;
      }

      for (const message of messages) {
        const isFaturamento = isUnimedCgFaturamentoSubject(message.subject);
        const isEntrega = isUnimedCgEntregaSubject(message.subject);
        if (!isFaturamento && !isEntrega) {
          skipped += 1;
          continue;
        }

        const processIdFromSubject = extractProcessIdFromSubject(message.subject);
        if (!processIdFromSubject) {
          skipped += 1;
          continue;
        }

        if (isEntrega) {
          const existingSource = await resolved.deliveryStore.findSourceByInternetMessageId(
            companyId,
            message.internetMessageId,
          );

          const retryNotification = Boolean(
            existingSource
              && !existingSource.whatsappSentAt
              && resolved.whatsapp
              && resolved.deliveryStore.markWhatsAppSent
              && !notifyAttempted.has(message.internetMessageId)
              && isWithinUnimedCgNotifyWindow(message.receivedAt),
          );
          if (existingSource && !retryNotification) {
            skipped += 1;
            continue;
          }

          let sourceUrl: string | null = null;
          let pdf: Buffer | null = null;
          let parsed = parseDeliveryPageHtml('', processIdFromSubject);

          try {
            const body = await resolved.mail.getBodyHtml(mailbox, message.graphMessageId);
            sourceUrl = extractCliqueAquiUrl(body.content);
            if (!sourceUrl) {
              skipped += 1;
              continue;
            }
            const pageHtml = await resolved.fetch.fetchHtml(sourceUrl);
            parsed = parseDeliveryPageHtml(pageHtml, processIdFromSubject);
            if (!parsed.processId) {
              skipped += 1;
              continue;
            }
            pdf = await resolved.fetch.renderPdf(sourceUrl);
          } catch (error) {
            errors.push(sanitizeError(error instanceof Error ? error.message : 'link/pdf'));
            log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_delivery_link_failed');
            continue;
          }

          const fileName = buildDeliveryFileName(parsed.processId);

          const notifyWhatsApp = async (content: Buffer) => {
            if (!resolved.whatsapp) return;
            if (!isWithinUnimedCgNotifyWindow(message.receivedAt)) return;
            if (notifyAttempted.has(message.internetMessageId)) return;
            notifyAttempted.add(message.internetMessageId);

            const result = await notifyUnimedCgDelivery({
              target: resolved.whatsapp,
              fields: {
                processId: parsed.processId,
                principalAuthorization: parsed.principalAuthorization,
                status: parsed.status,
                supplier: parsed.supplier,
              },
              fileName,
              content,
            });
            if (!result.sent) {
              errors.push('aviso WhatsApp falhou');
              return;
            }
            await resolved.deliveryStore.markWhatsAppSent?.(
              companyId,
              message.internetMessageId,
              result.messageId,
            );
          };

          if (existingSource) {
            if (pdf) await notifyWhatsApp(pdf);
            skipped += 1;
            continue;
          }

          const existingAuth = await resolved.deliveryStore.findByProcessId(companyId, parsed.processId);
          const upgrades = existingAuth
            ? shouldUpgrade(existingAuth.parseStatus, parsed.parseStatus)
            : false;

          if (existingAuth && !upgrades) {
            try {
              await resolved.deliveryStore.persistSourceOnly({
                companyId,
                authorizationId: existingAuth.id,
                mailbox,
                graphMessageId: message.graphMessageId,
                internetMessageId: message.internetMessageId,
                receivedAt: message.receivedAt,
              });
            } catch (error) {
              failedPersists += 1;
              errors.push(sanitizeError(error instanceof Error ? error.message : 'origem'));
              continue;
            }
            skipped += 1;
            continue;
          }

          if (!pdf) {
            skipped += 1;
            continue;
          }

          let itemId: string;
          try {
            const uploaded = await resolved.drive.uploadPdf({ fileName, content: pdf });
            itemId = uploaded.itemId;
          } catch (error) {
            failedUploads += 1;
            errors.push(sanitizeError(error instanceof Error ? error.message : 'upload'));
            log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_delivery_upload_failed');
            continue;
          }

          const persistBase: PersistDeliveryArgs = {
            companyId,
            processId: parsed.processId,
            principalAuthorization: parsed.principalAuthorization,
            status: parsed.status,
            authorizedAt: parsed.authorizedAt,
            supplier: parsed.supplier,
            parseStatus: parsed.parseStatus,
            fileName,
            oneDriveItemId: itemId,
            sourceUrl,
            receivedAt: message.receivedAt,
            internetMessageId: message.internetMessageId,
            mailbox,
            graphMessageId: message.graphMessageId,
          };

          try {
            if (existingAuth) {
              await resolved.deliveryStore.persistUpgrade({
                ...persistBase,
                authorizationId: existingAuth.id,
              });
            } else {
              await resolved.deliveryStore.persistConfirmed(persistBase);
            }
          } catch (error) {
            failedPersists += 1;
            errors.push(sanitizeError(error instanceof Error ? error.message : 'persistência'));
            log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_delivery_persist_failed');
            await collectOrphanUpload(itemId, existingAuth?.oneDriveItemId ?? null);
            continue;
          }

          processed += 1;
          await notifyWhatsApp(pdf);
          continue;
        }

        const existingSource = await resolved.store.findSourceByInternetMessageId(
          companyId,
          message.internetMessageId,
        );

        const retryNotification = Boolean(
          existingSource
            && !existingSource.whatsappSentAt
            && resolved.whatsapp
            && resolved.store.markWhatsAppSent
            && !notifyAttempted.has(message.internetMessageId)
            && isWithinUnimedCgNotifyWindow(message.receivedAt),
        );
        if (existingSource && !retryNotification) {
          skipped += 1;
          continue;
        }

        let sourceUrl: string | null = null;
        let pdf: Buffer | null = null;
        let parsed = parseAuthorizationPageHtml('', processIdFromSubject);

        try {
          const body = await resolved.mail.getBodyHtml(mailbox, message.graphMessageId);
          sourceUrl = extractCliqueAquiUrl(body.content);
          if (!sourceUrl) {
            skipped += 1;
            continue;
          }
          const pageHtml = await resolved.fetch.fetchHtml(sourceUrl);
          parsed = parseAuthorizationPageHtml(pageHtml, processIdFromSubject);
          if (!parsed.processId) {
            skipped += 1;
            continue;
          }
          pdf = await resolved.fetch.renderPdf(sourceUrl);
        } catch (error) {
          errors.push(sanitizeError(error instanceof Error ? error.message : 'link/pdf'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_link_failed');
          continue;
        }

        const fileName = buildFileName(parsed.processId);
        const totalCents = parsed.totalCents ?? 0;

        const notifyWhatsApp = async (content: Buffer) => {
          if (!resolved.whatsapp) return;
          if (!isWithinUnimedCgNotifyWindow(message.receivedAt)) return;
          if (notifyAttempted.has(message.internetMessageId)) return;
          notifyAttempted.add(message.internetMessageId);

          const result = await notifyUnimedCgAuthorization({
            target: resolved.whatsapp,
            fields: {
              processId: parsed.processId,
              authorizationNumber: parsed.authorizationNumber,
              location: parsed.location,
              totalCents,
            },
            fileName,
            content,
          });
          if (!result.sent) {
            errors.push('aviso WhatsApp falhou');
            return;
          }
          await resolved.store.markWhatsAppSent?.(
            companyId,
            message.internetMessageId,
            result.messageId,
          );
        };

        if (existingSource) {
          if (pdf) await notifyWhatsApp(pdf);
          skipped += 1;
          continue;
        }

        const existingAuth = await resolved.store.findByProcessId(companyId, parsed.processId);
        const upgrades = existingAuth
          ? shouldUpgrade(existingAuth.parseStatus, parsed.parseStatus)
          : false;

        if (existingAuth && !upgrades) {
          try {
            await resolved.store.persistSourceOnly({
              companyId,
              authorizationId: existingAuth.id,
              mailbox,
              graphMessageId: message.graphMessageId,
              internetMessageId: message.internetMessageId,
              receivedAt: message.receivedAt,
            });
          } catch (error) {
            failedPersists += 1;
            errors.push(sanitizeError(error instanceof Error ? error.message : 'origem'));
            continue;
          }
          skipped += 1;
          continue;
        }

        if (!pdf) {
          skipped += 1;
          continue;
        }

        let itemId: string;
        try {
          const uploaded = await resolved.drive.uploadPdf({ fileName, content: pdf });
          itemId = uploaded.itemId;
        } catch (error) {
          failedUploads += 1;
          errors.push(sanitizeError(error instanceof Error ? error.message : 'upload'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_upload_failed');
          continue;
        }

        const persistBase: PersistArgs = {
          companyId,
          processId: parsed.processId,
          authorizationNumber: parsed.authorizationNumber,
          procedureDate: parsed.procedureDate,
          location: parsed.location,
          totalCents,
          parseStatus: parsed.parseStatus,
          fileName,
          oneDriveItemId: itemId,
          sourceUrl,
          receivedAt: message.receivedAt,
          internetMessageId: message.internetMessageId,
          mailbox,
          graphMessageId: message.graphMessageId,
        };

        try {
          if (existingAuth) {
            await resolved.store.persistUpgrade({ ...persistBase, authorizationId: existingAuth.id });
          } else {
            await resolved.store.persistConfirmed(persistBase);
          }
        } catch (error) {
          failedPersists += 1;
          errors.push(sanitizeError(error instanceof Error ? error.message : 'persistência'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'unimed_cg_persist_failed');
          await collectOrphanUpload(itemId, existingAuth?.oneDriveItemId ?? null);
          continue;
        }

        processed += 1;
        await notifyWhatsApp(pdf);
      }
    }

    const now = new Date();
    const previous = await resolved.store.loadIngestState(companyId);
    const ok = errors.length === 0
      && failedUploads === 0
      && failedPersists === 0
      && failedMailboxes.length === 0;
    await resolved.store.saveIngestState(companyId, {
      ...(ok
        ? { lastSuccessAt: now, backfillCompletedAt: previous?.backfillCompletedAt ?? now }
        : {}),
      lastError: errors[0] ?? null,
    });

    return {
      ok,
      processed,
      skipped,
      failedUploads,
      failedPersists,
      failedMailboxes,
      lastCollectedAt: ok ? now.toISOString() : previous?.lastSuccessAt?.toISOString() ?? null,
    };
  } finally {
    await lock.release();
  }
}

export async function startUnimedCgMailIngest(): Promise<void> {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('unimed-cg-mail-ingest', {
    enabled: !disabled,
    heartbeatIntervalMs: UNIMED_CG_INGEST_INTERVAL_MS,
  });
  if (disabled) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('unimed-cg-mail-ingest');
    try {
      const company = await getSingleCompany();
      if (!company) return;
      await runUnimedCgIngest(company.id);
    } catch (error) {
      markBackgroundServiceError('unimed-cg-mail-ingest', error);
      log.error(
        { err: sanitizeError(error instanceof Error ? error.message : 'ingest') },
        'unimed_cg_ingest_tick_failed',
      );
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, UNIMED_CG_INGEST_INTERVAL_MS);
  }, 10_000);
}
