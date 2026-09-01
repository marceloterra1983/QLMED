import { createLogger } from '@/lib/logger';
import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  uploadOneDriveFile,
} from '@/lib/onedrive-client';
import {
  GraphMailboxError,
  listMailboxMessagesBySenders,
  listImpcgPdfAttachments,
  type ImpcgMailMessage,
  type ImpcgPdfAttachment,
} from '@/lib/graph-mail-client';
import { acquirePostgresAdvisoryLock, cassemsMailIngestLockKey } from '@/lib/postgres-advisory-lock';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';
import { getSingleCompany } from '@/lib/single-company';
import {
  CASSEMS_INGEST_INTERVAL_MS,
  CASSEMS_MAILBOXES,
  CASSEMS_ONEDRIVE_FOLDER,
  CASSEMS_SENDER_EMAILS,
} from './constants';
import { extractPdfText } from './extract-pdf-text';
import {
  defaultCassemsFolderPort,
  ingestCassemsFolder,
  resolveCassemsOneDrive,
  type CassemsFolderPort,
} from './folder-ingest';
import { buildCassemsFileName, parseOficio, shouldUpgrade, type ParsedCassemsItem } from './parse-oficio';
import { prismaCassemsStore } from './store';
import {
  isWithinCassemsNotifyWindow,
  notifyCassemsAuthorization,
  resolveCassemsWhatsAppTarget,
  type CassemsWhatsAppTarget,
} from './whatsapp-notify';

const log = createLogger('cassems/ingest');

export type CassemsMailPort = {
  listMessages(mailbox: string, options?: { signal?: AbortSignal }): Promise<ImpcgMailMessage[]>;
  getPdfAttachments(
    mailbox: string,
    graphMessageId: string,
    signal?: AbortSignal,
  ): Promise<ImpcgPdfAttachment[]>;
};

export type CassemsDrivePort = {
  uploadPdf(input: { fileName: string; content: Buffer }): Promise<{ itemId: string }>;
};

export type { CassemsFolderPort };

export type CassemsAuthorizationRow = {
  id: string;
  oficioNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  patientName: string;
  oneDriveItemId: string;
};

export type PersistArgs = {
  companyId: string;
  oficioNumber: string;
  issuedAt: Date | null;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  receivedAt: Date;
  items: ParsedCassemsItem[];
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type CassemsStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null; whatsappSentAt?: Date | null } | null>;
  findByOficioNumber(companyId: string, oficioNumber: string): Promise<CassemsAuthorizationRow | null>;
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
  /** SPEC-034 FR-004: idempotência do aviso por mensagem de origem. */
  markWhatsAppSent?(
    companyId: string,
    internetMessageId: string,
    messageId: string | null,
  ): Promise<void>;
};

export type CassemsIngestResult = {
  ok: boolean;
  busy?: boolean;
  processed: number;
  skipped: number;
  failedUploads: number;
  failedMailboxes: string[];
  lastCollectedAt: string | null;
};

export type CassemsIngestDeps = {
  mail: CassemsMailPort;
  drive: CassemsDrivePort;
  folder?: CassemsFolderPort | null;
  extractText: (pdf: Buffer) => Promise<string>;
  store: CassemsStorePort;
  /** SPEC-034: ausente = canal WhatsApp desligado. */
  whatsapp?: CassemsWhatsAppTarget | null;
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

function defaultMailPort(): CassemsMailPort {
  return {
    listMessages: (mailbox, options) =>
      listMailboxMessagesBySenders(mailbox, CASSEMS_SENDER_EMAILS, options),
    getPdfAttachments: (mailbox, graphMessageId, signal) =>
      listImpcgPdfAttachments(mailbox, graphMessageId, signal),
  };
}

async function defaultDrivePort(companyId: string): Promise<CassemsDrivePort> {
  const { accessToken, driveId } = await resolveCassemsOneDrive(companyId);
  await ensureOneDriveFolder(accessToken, driveId, CASSEMS_ONEDRIVE_FOLDER);
  return {
    async uploadPdf(input) {
      const uploaded = await uploadOneDriveFile(
        accessToken,
        driveId,
        CASSEMS_ONEDRIVE_FOLDER,
        input.fileName,
        input.content,
      );
      return { itemId: uploaded.id };
    },
  };
}

export async function downloadCassemsPdf(companyId: string, itemId: string): Promise<Buffer> {
  const { accessToken, driveId } = await resolveCassemsOneDrive(companyId);
  return downloadOneDriveItemContent(accessToken, driveId, itemId);
}

export async function createDefaultCassemsDeps(companyId: string): Promise<CassemsIngestDeps> {
  return {
    mail: defaultMailPort(),
    drive: await defaultDrivePort(companyId),
    folder: await defaultCassemsFolderPort(companyId),
    extractText: extractPdfText,
    store: prismaCassemsStore,
  };
}

type CassemsRunOptions = Partial<CassemsIngestDeps> & {
  companyId: string;
};

export async function runCassemsIngest(
  input: string | CassemsRunOptions,
  deps?: Partial<CassemsIngestDeps>,
): Promise<CassemsIngestResult> {
  const options: CassemsRunOptions = typeof input === 'string'
    ? { companyId: input, ...deps }
    : { ...deps, ...input };
  const companyId = options.companyId;

  const lock = await acquirePostgresAdvisoryLock(cassemsMailIngestLockKey(companyId));
  if (!lock) {
    return {
      ok: false,
      busy: true,
      processed: 0,
      skipped: 0,
      failedUploads: 0,
      failedMailboxes: [],
      lastCollectedAt: null,
    };
  }

  const resolved: CassemsIngestDeps = {
    mail: options.mail ?? defaultMailPort(),
    drive: options.drive ?? await defaultDrivePort(companyId),
    folder: options.folder === undefined
      ? (options.mail || options.drive || options.store || options.extractText
        ? null
        : await defaultCassemsFolderPort(companyId))
      : options.folder,
    extractText: options.extractText ?? extractPdfText,
    store: options.store ?? prismaCassemsStore,
    whatsapp: options.whatsapp !== undefined ? options.whatsapp : resolveCassemsWhatsAppTarget(),
  };

  let processed = 0;
  let skipped = 0;
  let failedUploads = 0;
  const failedMailboxes: string[] = [];
  const errors: string[] = [];

  try {
    for (const mailbox of CASSEMS_MAILBOXES) {
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
        log.warn({ mailbox: label, status: status || undefined }, 'cassems_mailbox_failed');
        continue;
      }

      for (const message of messages) {
        const existingSource = await resolved.store.findSourceByInternetMessageId(
          companyId,
          message.internetMessageId,
        );
        if (existingSource) {
          skipped += 1;
          continue;
        }

        let attachments: ImpcgPdfAttachment[] = [];
        try {
          attachments = await resolved.mail.getPdfAttachments(mailbox, message.graphMessageId);
        } catch (error) {
          errors.push(sanitizeError(error instanceof Error ? error.message : 'anexo'));
          continue;
        }
        if (attachments.length === 0) {
          skipped += 1;
          continue;
        }

        const pdf = attachments[0];
        const text = await resolved.extractText(pdf.content);
        const parsed = parseOficio(text, message.subject);
        if (!parsed.oficioNumber) {
          skipped += 1;
          continue;
        }

        const fileName = buildCassemsFileName(parsed.oficioNumber, parsed.patientName);
        let itemId: string;
        try {
          const uploaded = await resolved.drive.uploadPdf({ fileName, content: pdf.content });
          itemId = uploaded.itemId;
        } catch (error) {
          failedUploads += 1;
          errors.push(sanitizeError(error instanceof Error ? error.message : 'upload'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'cassems_upload_failed');
          continue;
        }

        const persistBase: PersistArgs = {
          companyId,
          oficioNumber: parsed.oficioNumber,
          issuedAt: parsed.issuedAt,
          patientName: parsed.patientName,
          patientRegistry: parsed.patientRegistry,
          doctorName: parsed.doctorName,
          doctorCrm: parsed.doctorCrm,
          procedureName: parsed.procedureName,
          hospitalName: parsed.hospitalName,
          totalCents: parsed.totalCents ?? 0,
          parseStatus: parsed.parseStatus,
          fileName,
          oneDriveItemId: itemId,
          receivedAt: message.receivedAt,
          items: parsed.items,
          internetMessageId: message.internetMessageId,
          mailbox,
          graphMessageId: message.graphMessageId,
        };

        const oficioNumber = parsed.oficioNumber;
        const notifyWhatsApp = async () => {
          if (!resolved.whatsapp) return;
          if (!isWithinCassemsNotifyWindow(message.receivedAt)) return;

          const result = await notifyCassemsAuthorization({
            target: resolved.whatsapp,
            fields: {
              oficioNumber,
              patientName: parsed.patientName,
              patientRegistry: parsed.patientRegistry,
              doctorName: parsed.doctorName,
              doctorCrm: parsed.doctorCrm,
              hospitalName: parsed.hospitalName,
            },
            fileName,
            content: pdf.content,
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

        const existingAuth = await resolved.store.findByOficioNumber(companyId, parsed.oficioNumber);
        if (!existingAuth) {
          await resolved.store.persistConfirmed(persistBase);
          processed += 1;
          await notifyWhatsApp();
          continue;
        }

        if (shouldUpgrade(existingAuth.parseStatus, parsed.parseStatus)) {
          await resolved.store.persistUpgrade({ ...persistBase, authorizationId: existingAuth.id });
          processed += 1;
          await notifyWhatsApp();
          continue;
        }

        await resolved.store.persistSourceOnly({
          companyId,
          authorizationId: existingAuth.id,
          mailbox,
          graphMessageId: message.graphMessageId,
          internetMessageId: message.internetMessageId,
          receivedAt: message.receivedAt,
        });
        skipped += 1;
      }
    }

    if (resolved.folder) {
      try {
        const folderResult = await ingestCassemsFolder({
          companyId,
          folder: resolved.folder,
          extractText: resolved.extractText,
          store: resolved.store,
        });
        processed += folderResult.processed;
        skipped += folderResult.skipped;
      } catch (error) {
        errors.push(sanitizeError(error instanceof Error ? error.message : 'pasta CASSEMS'));
        log.warn('cassems_folder_failed');
      }
    }

    const now = new Date();
    const previous = await resolved.store.loadIngestState(companyId);
    await resolved.store.saveIngestState(companyId, {
      lastSuccessAt: now,
      backfillCompletedAt: previous?.backfillCompletedAt ?? now,
      lastError: errors[0] ?? null,
    });

    return {
      ok: true,
      processed,
      skipped,
      failedUploads,
      failedMailboxes,
      lastCollectedAt: now.toISOString(),
    };
  } finally {
    await lock.release();
  }
}

export async function startCassemsMailIngest(): Promise<void> {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('cassems-mail-ingest', { enabled: !disabled });
  if (disabled) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('cassems-mail-ingest');
    try {
      const company = await getSingleCompany();
      if (!company) return;
      await runCassemsIngest(company.id);
    } catch (error) {
      markBackgroundServiceError('cassems-mail-ingest', error);
      log.error({ err: sanitizeError(error instanceof Error ? error.message : 'ingest') }, 'cassems_ingest_tick_failed');
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, CASSEMS_INGEST_INTERVAL_MS);
  }, 6_000);
}
