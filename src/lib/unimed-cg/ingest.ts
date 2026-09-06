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
  type GraphMailMessage,
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
import { renderHtmlToPdf } from '@/lib/pdf/render';
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
  parseAuthorizationPageHtml,
  parseDeliveryPageHtml,
  shouldUpgrade,
} from './parse-page';
import {
  buildInvoiceDeadlineFileName,
  buildPreSolicitationFileName,
  buildReversalFileName,
  classifyUnimedCgSubject,
  extractPatientNameFromSubject,
  extractProcedureTypeFromPreSubject,
  extractProcessIdFromPrazoNfSubject,
  extractProcessIdFromReversaoSubject,
  parseInvoiceDeadlineEmailHtml,
  parsePreSolicitationEmailHtml,
  parseReversalEmailHtml,
  type ParsedUnimedCgInvoiceDeadline,
  type ParsedUnimedCgPreSolicitation,
  type ParsedUnimedCgReversal,
} from './parse-email-kinds';
import { processEmailHtmlKind, shouldUpgradeOrNewer } from './ingest-email-html';
import { openOpmePortalSession } from './opme-portal';
import { backfillMissingUnimedCgPatientNames } from './backfill-patient-names';
import { runUnimedCgBillingMatch } from './billing-match';
import { prismaUnimedCgDeliveryStore } from './delivery-store';
import { prismaUnimedCgInvoiceDeadlineStore } from './invoice-deadline-store';
import { prismaUnimedCgPreSolicitationStore } from './pre-solicitation-store';
import { prismaUnimedCgReversalStore } from './reversal-store';
import { prismaUnimedCgStore } from './store';
import {
  isWithinUnimedCgNotifyWindow,
  notifyUnimedCgAuthorization,
  notifyUnimedCgDelivery,
  notifyUnimedCgInvoiceDeadline,
  notifyUnimedCgPreSolicitation,
  notifyUnimedCgReversal,
  resolveUnimedCgWhatsAppTarget,
  type UnimedCgWhatsAppTarget,
} from './whatsapp-notify';

const log = createLogger('unimed-cg/ingest');

export type UnimedCgMailPort = {
  listMessages(mailbox: string, options?: { signal?: AbortSignal }): Promise<GraphMailMessage[]>;
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
  renderHtmlPdf(html: string): Promise<Buffer>;
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
  patientName: string | null;
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
  patientName: string | null;
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


export type PersistReversalArgs = {
  companyId: string;
  processId: string;
  authorizationNumber: string | null;
  procedureDate: Date | null;
  patientName: string | null;
  location: string | null;
  procedureType: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistPreSolicitationArgs = {
  companyId: string;
  preSolicitationId: string;
  patientName: string | null;
  procedureType: string | null;
  quoteDeadlineDays: number | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type PersistInvoiceDeadlineArgs = {
  companyId: string;
  processId: string;
  patientName: string | null;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  sourceUrl: string | null;
  receivedAt: Date;
  internetMessageId?: string;
  mailbox?: string;
  graphMessageId?: string;
};

export type UnimedCgReversalStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; reversalId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(
    companyId: string,
    processId: string,
  ): Promise<(UnimedCgAuthorizationRow & { receivedAt?: Date }) | null>;
  persistConfirmed(input: PersistReversalArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistReversalArgs & { reversalId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    reversalId: string;
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

export type UnimedCgPreSolicitationStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; preSolicitationRefId: string | null; whatsappSentAt?: Date | null } | null>;
  findByPreSolicitationId(
    companyId: string,
    preSolicitationId: string,
  ): Promise<{
    id: string;
    preSolicitationId: string;
    parseStatus: 'ok' | 'parcial' | 'falha';
    oneDriveItemId: string;
    receivedAt?: Date;
  } | null>;
  persistConfirmed(input: PersistPreSolicitationArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistPreSolicitationArgs & { recordId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    recordId: string;
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

export type UnimedCgInvoiceDeadlineStorePort = {
  findSourceByInternetMessageId(
    companyId: string,
    internetMessageId: string,
  ): Promise<{ id: string; deadlineId: string | null; whatsappSentAt?: Date | null } | null>;
  findByProcessId(
    companyId: string,
    processId: string,
  ): Promise<(UnimedCgAuthorizationRow & { receivedAt?: Date }) | null>;
  persistConfirmed(input: PersistInvoiceDeadlineArgs): Promise<{ id: string }>;
  persistUpgrade(input: PersistInvoiceDeadlineArgs & { deadlineId: string }): Promise<void>;
  persistSourceOnly(input: {
    companyId: string;
    deadlineId: string;
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
  reversalStore: UnimedCgReversalStorePort;
  preSolicitationStore: UnimedCgPreSolicitationStorePort;
  invoiceDeadlineStore: UnimedCgInvoiceDeadlineStorePort;
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
    async renderHtmlPdf(html) {
      return renderHtmlToPdf(html, { format: 'A4', printBackground: true });
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
    reversalStore: prismaUnimedCgReversalStore,
    preSolicitationStore: prismaUnimedCgPreSolicitationStore,
    invoiceDeadlineStore: prismaUnimedCgInvoiceDeadlineStore,
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
    reversalStore: options.reversalStore ?? prismaUnimedCgReversalStore,
    preSolicitationStore: options.preSolicitationStore ?? prismaUnimedCgPreSolicitationStore,
    invoiceDeadlineStore: options.invoiceDeadlineStore ?? prismaUnimedCgInvoiceDeadlineStore,
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

  const opmeSession = await openOpmePortalSession();

  try {
    // Existing rows keep existingSource forever — enrich null patientName here.
    if (opmeSession) {
      await backfillMissingUnimedCgPatientNames({
        companyId,
        fetchBeneficiario: (processId) => opmeSession.fetchBeneficiario(processId),
      });
    }

    // Catch-up: autorizações × NF-e Unimed (infCpl). Trigger primário é a emissão.
    try {
      const billingMatch = await runUnimedCgBillingMatch(companyId);
      if (billingMatch.matched || billingMatch.ambiguous) {
        log.info(billingMatch, 'unimed_cg_billing_match_ingest_tick');
      }
    } catch (error) {
      log.error(
        { err: sanitizeError(error instanceof Error ? error.message : 'billing-match') },
        'unimed_cg_billing_match_ingest_failed',
      );
    }

    for (const mailbox of UNIMED_CG_MAILBOXES) {
      let messages: GraphMailMessage[] = [];
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
        const kind = classifyUnimedCgSubject(message.subject);
        if (kind === 'skip') {
          skipped += 1;
          continue;
        }

        if (kind === 'reversao' || kind === 'pre_solicitacao' || kind === 'prazo_nf') {
          const counters = {
            processed: 0,
            skipped: 0,
            failedUploads: 0,
            failedPersists: 0,
            errors,
          };
          const base = {
            companyId,
            mailbox,
            message,
            getBodyHtml: async (mb: string, gid: string) => resolved.mail.getBodyHtml(mb, gid),
            renderHtmlPdf: (html: string) => resolved.fetch.renderHtmlPdf(html),
            uploadPdf: (input: { fileName: string; content: Buffer }) => resolved.drive.uploadPdf(input),
            deletePdf: resolved.drive.deletePdf
              ? (itemId: string) => resolved.drive.deletePdf!(itemId)
              : undefined,
            whatsapp: resolved.whatsapp,
            notifyAttempted,
            collectOrphanUpload,
            sanitizeError,
            logWarn: (msg: string) => log.warn({ mailbox: mailboxLabel(mailbox) }, msg),
            counters,
          };

          if (kind === 'reversao') {
            const processIdFromSubject = extractProcessIdFromReversaoSubject(message.subject);
            if (!processIdFromSubject) {
              skipped += 1;
              continue;
            }
            await processEmailHtmlKind<ParsedUnimedCgReversal>({
              ...base,
              findSource: async () => {
                const row = await resolved.reversalStore.findSourceByInternetMessageId(
                  companyId,
                  message.internetMessageId,
                );
                return row
                  ? { id: row.id, entityId: row.reversalId, whatsappSentAt: row.whatsappSentAt }
                  : null;
              },
              findEntity: async (parsed) => resolved.reversalStore.findByProcessId(companyId, parsed.processId),
              parseBody: (html) => parseReversalEmailHtml(html, processIdFromSubject),
              isValid: (parsed) => Boolean(parsed.processId),
              buildFileName: (parsed) => buildReversalFileName(parsed.processId),
              shouldReplace: (existing, parsed, receivedAt) =>
                shouldUpgradeOrNewer(existing, parsed.parseStatus, receivedAt),
              persistConfirmed: async ({ parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.reversalStore.persistConfirmed({
                  companyId,
                  processId: parsed.processId,
                  authorizationNumber: parsed.authorizationNumber,
                  procedureDate: parsed.procedureDate,
                  patientName: opmeSession
                    ? await opmeSession.fetchBeneficiario(parsed.processId)
                    : null,
                  location: parsed.location,
                  procedureType: parsed.procedureType,
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistUpgrade: async ({ entityId, parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.reversalStore.persistUpgrade({
                  companyId,
                  reversalId: entityId,
                  processId: parsed.processId,
                  authorizationNumber: parsed.authorizationNumber,
                  procedureDate: parsed.procedureDate,
                  patientName: opmeSession
                    ? await opmeSession.fetchBeneficiario(parsed.processId)
                    : null,
                  location: parsed.location,
                  procedureType: parsed.procedureType,
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistSourceOnly: async (entityId) =>
                resolved.reversalStore.persistSourceOnly({
                  companyId,
                  reversalId: entityId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                  internetMessageId: message.internetMessageId,
                  receivedAt: message.receivedAt,
                }),
              markWhatsAppSent: resolved.reversalStore.markWhatsAppSent
                ? (messageId) => resolved.reversalStore.markWhatsAppSent!(
                  companyId,
                  message.internetMessageId,
                  messageId,
                )
                : undefined,
              notify: async (content, fileName, parsed) => {
                if (!resolved.whatsapp) return { sent: false, messageId: null };
                return notifyUnimedCgReversal({
                  target: resolved.whatsapp,
                  fields: {
                    processId: parsed.processId,
                    authorizationNumber: parsed.authorizationNumber,
                    location: parsed.location,
                    procedureType: parsed.procedureType,
                  },
                  fileName,
                  content,
                });
              },
            });
          } else if (kind === 'pre_solicitacao') {
            const subjectProcedureType = extractProcedureTypeFromPreSubject(message.subject);
            await processEmailHtmlKind<ParsedUnimedCgPreSolicitation>({
              ...base,
              findSource: async () => {
                const row = await resolved.preSolicitationStore.findSourceByInternetMessageId(
                  companyId,
                  message.internetMessageId,
                );
                return row
                  ? {
                    id: row.id,
                    entityId: row.preSolicitationRefId,
                    whatsappSentAt: row.whatsappSentAt,
                  }
                  : null;
              },
              findEntity: async (parsed) =>
                resolved.preSolicitationStore.findByPreSolicitationId(
                  companyId,
                  parsed.preSolicitationId,
                ),
              parseBody: (html) => parsePreSolicitationEmailHtml(html, subjectProcedureType),
              isValid: (parsed) => Boolean(parsed.preSolicitationId),
              buildFileName: (parsed) => buildPreSolicitationFileName(parsed.preSolicitationId),
              shouldReplace: (existing, parsed, receivedAt) =>
                shouldUpgradeOrNewer(existing, parsed.parseStatus, receivedAt),
              persistConfirmed: async ({ parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.preSolicitationStore.persistConfirmed({
                  companyId,
                  preSolicitationId: parsed.preSolicitationId,
                  patientName: opmeSession
                    ? await opmeSession.fetchBeneficiario(parsed.preSolicitationId)
                    : null,
                  procedureType: parsed.procedureType,
                  quoteDeadlineDays: parsed.quoteDeadlineDays,
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistUpgrade: async ({ entityId, parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.preSolicitationStore.persistUpgrade({
                  companyId,
                  recordId: entityId,
                  preSolicitationId: parsed.preSolicitationId,
                  patientName: opmeSession
                    ? await opmeSession.fetchBeneficiario(parsed.preSolicitationId)
                    : null,
                  procedureType: parsed.procedureType,
                  quoteDeadlineDays: parsed.quoteDeadlineDays,
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistSourceOnly: async (entityId) =>
                resolved.preSolicitationStore.persistSourceOnly({
                  companyId,
                  recordId: entityId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                  internetMessageId: message.internetMessageId,
                  receivedAt: message.receivedAt,
                }),
              markWhatsAppSent: resolved.preSolicitationStore.markWhatsAppSent
                ? (messageId) => resolved.preSolicitationStore.markWhatsAppSent!(
                  companyId,
                  message.internetMessageId,
                  messageId,
                )
                : undefined,
              notify: async (content, fileName, parsed) => {
                if (!resolved.whatsapp) return { sent: false, messageId: null };
                return notifyUnimedCgPreSolicitation({
                  target: resolved.whatsapp,
                  fields: {
                    preSolicitationId: parsed.preSolicitationId,
                    procedureType: parsed.procedureType,
                    quoteDeadlineDays: parsed.quoteDeadlineDays,
                  },
                  fileName,
                  content,
                });
              },
            });
          } else {
            const processIdFromSubject = extractProcessIdFromPrazoNfSubject(message.subject);
            if (!processIdFromSubject) {
              skipped += 1;
              continue;
            }
            const patientFromSubject = extractPatientNameFromSubject(message.subject);
            await processEmailHtmlKind<ParsedUnimedCgInvoiceDeadline>({
              ...base,
              findSource: async () => {
                const row = await resolved.invoiceDeadlineStore.findSourceByInternetMessageId(
                  companyId,
                  message.internetMessageId,
                );
                return row
                  ? { id: row.id, entityId: row.deadlineId, whatsappSentAt: row.whatsappSentAt }
                  : null;
              },
              findEntity: async (parsed) =>
                resolved.invoiceDeadlineStore.findByProcessId(companyId, parsed.processId),
              parseBody: (html) =>
                parseInvoiceDeadlineEmailHtml(html, processIdFromSubject, patientFromSubject),
              isValid: (parsed) => Boolean(parsed.processId),
              buildFileName: (parsed) => buildInvoiceDeadlineFileName(parsed.processId),
              shouldReplace: (existing, parsed, receivedAt) =>
                shouldUpgradeOrNewer(existing, parsed.parseStatus, receivedAt),
              persistConfirmed: async ({ parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.invoiceDeadlineStore.persistConfirmed({
                  companyId,
                  processId: parsed.processId,
                  patientName: parsed.patientName
                    ?? (opmeSession ? await opmeSession.fetchBeneficiario(parsed.processId) : null),
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistUpgrade: async ({ entityId, parsed, fileName, oneDriveItemId, sourceUrl }) =>
                resolved.invoiceDeadlineStore.persistUpgrade({
                  companyId,
                  deadlineId: entityId,
                  processId: parsed.processId,
                  patientName: parsed.patientName
                    ?? (opmeSession ? await opmeSession.fetchBeneficiario(parsed.processId) : null),
                  parseStatus: parsed.parseStatus,
                  fileName,
                  oneDriveItemId,
                  sourceUrl,
                  receivedAt: message.receivedAt,
                  internetMessageId: message.internetMessageId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                }),
              persistSourceOnly: async (entityId) =>
                resolved.invoiceDeadlineStore.persistSourceOnly({
                  companyId,
                  deadlineId: entityId,
                  mailbox,
                  graphMessageId: message.graphMessageId,
                  internetMessageId: message.internetMessageId,
                  receivedAt: message.receivedAt,
                }),
              markWhatsAppSent: resolved.invoiceDeadlineStore.markWhatsAppSent
                ? (messageId) => resolved.invoiceDeadlineStore.markWhatsAppSent!(
                  companyId,
                  message.internetMessageId,
                  messageId,
                )
                : undefined,
              notify: async (content, fileName, parsed) => {
                if (!resolved.whatsapp) return { sent: false, messageId: null };
                return notifyUnimedCgInvoiceDeadline({
                  target: resolved.whatsapp,
                  fields: {
                    processId: parsed.processId,
                    patientName: parsed.patientName,
                  },
                  fileName,
                  content,
                });
              },
            });
          }

          processed += counters.processed;
          skipped += counters.skipped;
          failedUploads += counters.failedUploads;
          failedPersists += counters.failedPersists;
          continue;
        }

        const isEntrega = kind === 'entrega';
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

          const patientName = opmeSession
            ? await opmeSession.fetchBeneficiario(parsed.processId)
            : null;
          const persistBase: PersistDeliveryArgs = {
            companyId,
            processId: parsed.processId,
            principalAuthorization: parsed.principalAuthorization,
            status: parsed.status,
            authorizedAt: parsed.authorizedAt,
            patientName,
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

        const patientName = opmeSession
          ? await opmeSession.fetchBeneficiario(parsed.processId)
          : null;
        const persistBase: PersistArgs = {
          companyId,
          processId: parsed.processId,
          authorizationNumber: parsed.authorizationNumber,
          procedureDate: parsed.procedureDate,
          patientName,
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
    await opmeSession?.close().catch(() => undefined);
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
