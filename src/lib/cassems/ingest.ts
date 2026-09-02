import { createLogger } from '@/lib/logger';
import {
  deleteOneDriveItem,
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
  /**
   * JOB-001: compensação do upload. Opcional só para não quebrar portes de
   * teste antigos — na ausência dela o órfão é contado como erro material.
   */
  deletePdf?(itemId: string): Promise<void>;
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
  /**
   * JOB-004: sucesso do pipeline, não batimento do tick. Só é `true` quando
   * caixa, upload, persistência e aviso passaram sem erro material.
   */
  ok: boolean;
  busy?: boolean;
  processed: number;
  skipped: number;
  failedUploads: number;
  failedPersists: number;
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
    async deletePdf(itemId) {
      await deleteOneDriveItem(accessToken, driveId, itemId);
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
      failedPersists: 0,
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
  let failedPersists = 0;
  const failedMailboxes: string[] = [];
  const errors: string[] = [];
  /**
   * A mesma mensagem pode chegar por mais de um remetente/caixa no mesmo tick.
   * Entre uma e outra o marcador durável ainda pode não estar visível, então
   * quem garante uma única tentativa por mensagem por tick é esta lista — o
   * `whatsappSentAt` garante entre ticks.
   */
  const notifyAttempted = new Set<string>();

  /**
   * JOB-001: o PDF vai para o OneDrive antes de existir linha no banco. Se a
   * persistência falha, o objeto fica órfão carregando dado clínico — e o tick
   * seguinte reenviaria por cima. Apaga-se o que acabou de subir, exceto quando
   * uma autorização já commitada aponta para o mesmo item.
   */
  const collectOrphanUpload = async (itemId: string, referencedItemId: string | null) => {
    if (referencedItemId === itemId) return;
    if (!resolved.drive.deletePdf) {
      errors.push('PDF órfão no OneDrive sem coleta');
      log.warn('cassems_orphan_pdf_uncollected');
      return;
    }
    try {
      await resolved.drive.deletePdf(itemId);
      log.warn('cassems_orphan_pdf_collected');
    } catch (error) {
      errors.push(sanitizeError(error instanceof Error ? error.message : 'coleta de órfão'));
      log.warn('cassems_orphan_pdf_collect_failed');
    }
  };

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
        /**
         * JOB-003: origem persistida com aviso por entregar era perda definitiva
         * — o tick seguinte via a origem e seguia em frente. `whatsappSentAt` já
         * é o marcador durável de entrega; enquanto for nulo e a janela do aviso
         * estiver aberta, a mensagem volta à fila. Fora da janela ou com o canal
         * desligado nem busca o anexo: não se paga Graph por trabalho que não vai
         * acontecer.
         */
        const retryNotification = Boolean(
          existingSource
            && !existingSource.whatsappSentAt
            && resolved.whatsapp
            // Sem `markWhatsAppSent` não existe marcador durável, e repetir sem
            // marcador é reenviar para sempre, não entregar uma vez.
            && resolved.store.markWhatsAppSent
            && !notifyAttempted.has(message.internetMessageId)
            && isWithinCassemsNotifyWindow(message.receivedAt),
        );
        if (existingSource && !retryNotification) {
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

        const persistBaseWithoutItem = {
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
          if (notifyAttempted.has(message.internetMessageId)) return;
          notifyAttempted.add(message.internetMessageId);

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

        // JOB-003: a origem já está no banco; só falta entregar o aviso.
        if (existingSource) {
          await notifyWhatsApp();
          skipped += 1;
          continue;
        }

        /**
         * JOB-001: saber ANTES do upload se já existe autorização decide duas
         * coisas — se o upload sequer precisa acontecer, e se a compensação pode
         * apagar o objeto sem destruir o PDF que uma linha commitada referencia.
         */
        const existingAuth = await resolved.store.findByOficioNumber(companyId, parsed.oficioNumber);
        const upgrades = existingAuth
          ? shouldUpgrade(existingAuth.parseStatus, parsed.parseStatus)
          : false;

        if (existingAuth && !upgrades) {
          // Nada muda na autorização: não se escreve PHI no OneDrive à toa.
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
            log.warn({ mailbox: mailboxLabel(mailbox) }, 'cassems_persist_failed');
            continue;
          }
          skipped += 1;
          continue;
        }

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

        const persistBase: PersistArgs = { ...persistBaseWithoutItem, oneDriveItemId: itemId };

        try {
          if (existingAuth) {
            await resolved.store.persistUpgrade({ ...persistBase, authorizationId: existingAuth.id });
          } else {
            await resolved.store.persistConfirmed(persistBase);
          }
        } catch (error) {
          failedPersists += 1;
          errors.push(sanitizeError(error instanceof Error ? error.message : 'persistência'));
          log.warn({ mailbox: mailboxLabel(mailbox) }, 'cassems_persist_failed');
          await collectOrphanUpload(itemId, existingAuth?.oneDriveItemId ?? null);
          continue;
        }

        processed += 1;
        await notifyWhatsApp();
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
    /**
     * JOB-004: `ok` era sempre verdadeiro quando o lock era adquirido, e
     * `lastSuccessAt` avançava por cima de uma coleta que perdeu mensagens. Um
     * tick parcial não é sucesso: mantém o carimbo anterior, para a tela não
     * afirmar "coletado agora" sobre dado que não chegou.
     */
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

export async function startCassemsMailIngest(): Promise<void> {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('cassems-mail-ingest', { enabled: !disabled, heartbeatIntervalMs: CASSEMS_INGEST_INTERVAL_MS });
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
