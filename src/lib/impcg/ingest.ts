import { createLogger } from '@/lib/logger';
import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  uploadOneDriveFile,
} from '@/lib/onedrive-client';
import {
  GraphMailboxError,
  listImpcgMailboxMessages,
  listImpcgPdfAttachments,
  type ImpcgMailMessage,
  type ImpcgPdfAttachment,
} from '@/lib/graph-mail-client';
import { acquirePostgresAdvisoryLock, impcgMailIngestLockKey } from '@/lib/postgres-advisory-lock';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
} from '@/lib/background-service-health';
import { getSingleCompany } from '@/lib/single-company';
import {
  IMPCG_INGEST_INTERVAL_MS,
  IMPCG_MAILBOX_TIMEOUT_MS,
  IMPCG_MAILBOXES,
  IMPCG_ONEDRIVE_FOLDER,
} from './constants';
import { extractPdfText } from './extract-pdf-text';
import {
  defaultImpcgFolderPort,
  ingestImpcgFolder,
  resolveImpcgOneDrive,
  type ImpcgFolderPort,
} from './folder-ingest';
import { buildImpcgFileName, parseOficio, shouldUpgrade, type ParsedImpcgItem } from './parse-oficio';
import { prismaImpcgStore } from './store';

const log = createLogger('impcg/ingest');

export type ImpcgMailPort = {
  listMessages(mailbox: string, options: { signal: AbortSignal }): Promise<ImpcgMailMessage[]>;
  getPdfAttachments(
    mailbox: string,
    graphMessageId: string,
    signal: AbortSignal,
  ): Promise<ImpcgPdfAttachment[]>;
};

export type ImpcgDrivePort = {
  uploadPdf(input: { fileName: string; content: Buffer }): Promise<{ itemId: string }>;
};

export type { ImpcgFolderPort };

export type ImpcgAuthorizationRow = {
  id: string;
  oficioNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  patientName: string;
  oneDriveItemId: string;
  issuedAt?: Date | null;
};

export type ImpcgStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; authorizationId: string | null } | null>;
  findByOficioNumber(companyId: string, oficioNumber: string): Promise<ImpcgAuthorizationRow | null>;
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
  items: ParsedImpcgItem[];
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type ImpcgIngestResult = {
  ok: boolean;
  busy?: boolean;
  processed: number;
  skipped: number;
  failedUploads: number;
  failedMailboxes: string[];
  lastCollectedAt: string | null;
};

export type ImpcgIngestDeps = {
  mail: ImpcgMailPort;
  drive: ImpcgDrivePort;
  folder?: ImpcgFolderPort | null;
  extractText: (pdf: Buffer) => Promise<string>;
  store: ImpcgStorePort;
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

function defaultMailPort(): ImpcgMailPort {
  return {
    listMessages: (mailbox, options) => listImpcgMailboxMessages(mailbox, options),
    getPdfAttachments: (mailbox, graphMessageId, signal) =>
      listImpcgPdfAttachments(mailbox, graphMessageId, signal),
  };
}

async function defaultDrivePort(companyId: string): Promise<ImpcgDrivePort> {
  const { accessToken, driveId } = await resolveImpcgOneDrive(companyId);
  await ensureOneDriveFolder(accessToken, driveId, IMPCG_ONEDRIVE_FOLDER);
  return {
    async uploadPdf(input) {
      const uploaded = await uploadOneDriveFile(
        accessToken,
        driveId,
        IMPCG_ONEDRIVE_FOLDER,
        input.fileName,
        input.content,
      );
      return { itemId: uploaded.id };
    },
  };
}

export async function downloadImpcgPdf(companyId: string, itemId: string): Promise<Buffer> {
  const { accessToken, driveId } = await resolveImpcgOneDrive(companyId);
  return downloadOneDriveItemContent(accessToken, driveId, itemId);
}

export async function createDefaultImpcgDeps(companyId: string): Promise<ImpcgIngestDeps> {
  return {
    mail: defaultMailPort(),
    drive: await defaultDrivePort(companyId),
    folder: await defaultImpcgFolderPort(companyId),
    extractText: extractPdfText,
    store: prismaImpcgStore,
  };
}

type ImpcgRunOptions = Partial<ImpcgIngestDeps> & {
  companyId: string;
  listMessages?: (mailbox: string, options?: { signal?: AbortSignal }) => Promise<unknown[]>;
  getPdfAttachment?: (
    mailbox: string,
    graphMessageId: string,
    signal?: AbortSignal,
  ) => Promise<{ name: string; contentBytes?: Buffer | string; content?: Buffer } | null>;
  uploadPdf?: (input: { fileName: string; content: Buffer } | string, content?: Buffer) => Promise<{ id?: string; itemId?: string }>;
};

function normalizeMailMessage(raw: unknown): ImpcgMailMessage | null {
  if (!raw || typeof raw !== 'object') return null;
  const row = raw as {
    graphMessageId?: string;
    id?: string;
    internetMessageId?: string;
    subject?: string;
    receivedAt?: Date | string;
    receivedDateTime?: string;
    hasAttachments?: boolean;
  };
  const graphMessageId = row.graphMessageId || row.id;
  const internetMessageId = row.internetMessageId;
  if (!graphMessageId || !internetMessageId) return null;
  const receivedAt = row.receivedAt instanceof Date
    ? row.receivedAt
    : new Date(row.receivedAt || row.receivedDateTime || Date.now());
  return {
    graphMessageId,
    internetMessageId,
    subject: row.subject || '',
    receivedAt,
    hasAttachments: Boolean(row.hasAttachments),
  };
}

function mailPortFromOptions(options: ImpcgRunOptions): ImpcgMailPort {
  if (options.mail) return options.mail;
  if (options.listMessages || options.getPdfAttachment) {
    return {
      async listMessages(mailbox, { signal }) {
        const rows = options.listMessages
          ? await options.listMessages(mailbox, { signal })
          : await defaultMailPort().listMessages(mailbox, { signal });
        return rows.map(normalizeMailMessage).filter((row): row is ImpcgMailMessage => row !== null);
      },
      async getPdfAttachments(mailbox, graphMessageId, signal) {
        if (!options.getPdfAttachment) {
          return defaultMailPort().getPdfAttachments(mailbox, graphMessageId, signal);
        }
        const attachment = await options.getPdfAttachment(mailbox, graphMessageId, signal);
        if (!attachment) return [];
        const content = attachment.content
          ?? (typeof attachment.contentBytes === 'string'
            ? Buffer.from(attachment.contentBytes, 'base64')
            : attachment.contentBytes);
        if (!content) return [];
        return [{ name: attachment.name, content }];
      },
    };
  }
  return defaultMailPort();
}

function drivePortFromOptions(options: ImpcgRunOptions, companyId: string): ImpcgDrivePort | Promise<ImpcgDrivePort> {
  if (options.drive) return options.drive;
  if (options.uploadPdf) {
    return {
      async uploadPdf(input) {
        const uploaded = await options.uploadPdf!(input, input.content);
        const itemId = uploaded.itemId || uploaded.id;
        if (!itemId) throw new Error('upload sem item id');
        return { itemId };
      },
    };
  }
  return defaultDrivePort(companyId);
}

function folderPortFromOptions(
  options: ImpcgRunOptions,
  companyId: string,
): ImpcgFolderPort | Promise<ImpcgFolderPort> | null {
  if (options.folder) return options.folder;
  if (options.mail || options.drive || options.store || options.extractText) return null;
  return defaultImpcgFolderPort(companyId);
}

export async function runImpcgIngest(
  input: string | ImpcgRunOptions,
  deps?: Partial<ImpcgIngestDeps>,
): Promise<ImpcgIngestResult> {
  const options: ImpcgRunOptions = typeof input === 'string'
    ? { companyId: input, ...deps }
    : { ...deps, ...input };
  const companyId = options.companyId;

  const lock = await acquirePostgresAdvisoryLock(impcgMailIngestLockKey(companyId));
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

  const resolved: ImpcgIngestDeps = {
    mail: mailPortFromOptions(options),
    drive: await drivePortFromOptions(options, companyId),
    folder: await folderPortFromOptions(options, companyId),
    extractText: options.extractText ?? extractPdfText,
    store: options.store ?? prismaImpcgStore,
  };

  let processed = 0;
  let skipped = 0;
  let failedUploads = 0;
  const failedMailboxes: string[] = [];
  const errors: string[] = [];

  try {
    for (const mailbox of IMPCG_MAILBOXES) {
      const signal = AbortSignal.timeout(IMPCG_MAILBOX_TIMEOUT_MS);
      let messages: ImpcgMailMessage[] = [];
      try {
        messages = await resolved.mail.listMessages(mailbox, { signal });
      } catch (error) {
        const label = mailboxLabel(mailbox);
        failedMailboxes.push(label);
        const status = error instanceof GraphMailboxError ? error.status : 0;
        errors.push(status === 403
          ? `leitura de caixa falhou (${status})`
          : sanitizeError(error instanceof Error ? error.message : 'falha na caixa'));
        log.warn({ mailbox: label, status: status || undefined }, 'impcg_mailbox_failed');
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
          attachments = await resolved.mail.getPdfAttachments(mailbox, message.graphMessageId, signal);
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

        const fileName = buildImpcgFileName(parsed.oficioNumber, parsed.patientName);
        let itemId: string;
        try {
          const uploaded = await resolved.drive.uploadPdf({ fileName, content: pdf.content });
          itemId = uploaded.itemId;
        } catch (error) {
          failedUploads += 1;
          errors.push(sanitizeError(error instanceof Error ? error.message : 'upload'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'impcg_upload_failed');
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

        const existingAuth = await resolved.store.findByOficioNumber(companyId, parsed.oficioNumber);
        if (!existingAuth) {
          await resolved.store.persistConfirmed(persistBase);
          processed += 1;
          continue;
        }

        if (shouldUpgrade(existingAuth.parseStatus, parsed.parseStatus)) {
          await resolved.store.persistUpgrade({ ...persistBase, authorizationId: existingAuth.id });
          processed += 1;
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
        const folderResult = await ingestImpcgFolder({
          companyId,
          folder: resolved.folder,
          extractText: resolved.extractText,
          store: resolved.store,
        });
        processed += folderResult.processed;
        skipped += folderResult.skipped;
      } catch (error) {
        errors.push(sanitizeError(error instanceof Error ? error.message : 'pasta IMPCG'));
        log.warn('impcg_folder_failed');
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

export async function startImpcgMailIngest(): Promise<void> {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('impcg-mail-ingest', { enabled: !disabled });
  if (disabled) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('impcg-mail-ingest');
    try {
      const company = await getSingleCompany();
      if (!company) return;
      await runImpcgIngest(company.id);
    } catch (error) {
      markBackgroundServiceError('impcg-mail-ingest', error);
      log.error({ err: sanitizeError(error instanceof Error ? error.message : 'ingest') }, 'impcg_ingest_tick_failed');
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, IMPCG_INGEST_INTERVAL_MS);
  }, 5_000);
}
