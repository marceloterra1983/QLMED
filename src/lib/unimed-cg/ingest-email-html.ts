import type { ImpcgMailMessage } from '@/lib/graph-mail-client';
import { extractCliqueAquiUrl, shouldUpgrade } from './parse-page';
import type { UnimedCgParseStatus } from './constants';
import {
  isWithinUnimedCgNotifyWindow,
  type UnimedCgWhatsAppTarget,
} from './whatsapp-notify';

export type EmailHtmlKindProps = {
  companyId: string;
  mailbox: string;
  message: ImpcgMailMessage;
  getBodyHtml: (mailbox: string, graphMessageId: string) => Promise<{ content: string }>;
  renderHtmlPdf: (html: string) => Promise<Buffer>;
  uploadPdf: (input: { fileName: string; content: Buffer }) => Promise<{ itemId: string }>;
  deletePdf?: (itemId: string) => Promise<void>;
  whatsapp: UnimedCgWhatsAppTarget | null | undefined;
  notifyAttempted: Set<string>;
  collectOrphanUpload: (itemId: string, referencedItemId: string | null) => Promise<void>;
  sanitizeError: (message: string) => string;
  logWarn: (msg: string) => void;
};

export type EmailHtmlKindCounters = {
  processed: number;
  skipped: number;
  failedUploads: number;
  failedPersists: number;
  errors: string[];
};

type SourceRow = {
  id: string;
  entityId: string | null;
  whatsappSentAt?: Date | null;
};

type EntityRow = {
  id: string;
  parseStatus: UnimedCgParseStatus;
  oneDriveItemId: string;
  receivedAt?: Date;
};

export async function processEmailHtmlKind<TParsed extends { parseStatus: UnimedCgParseStatus }>(
  input: EmailHtmlKindProps & {
    counters: EmailHtmlKindCounters;
    findSource: () => Promise<SourceRow | null>;
    findEntity: (parsed: TParsed) => Promise<EntityRow | null>;
    parseBody: (html: string) => TParsed | null;
    isValid: (parsed: TParsed) => boolean;
    buildFileName: (parsed: TParsed) => string;
    shouldReplace: (existing: EntityRow, parsed: TParsed, receivedAt: Date) => boolean;
    persistConfirmed: (args: {
      parsed: TParsed;
      fileName: string;
      oneDriveItemId: string;
      sourceUrl: string | null;
    }) => Promise<{ id: string }>;
    persistUpgrade: (args: {
      entityId: string;
      parsed: TParsed;
      fileName: string;
      oneDriveItemId: string;
      sourceUrl: string | null;
    }) => Promise<void>;
    persistSourceOnly: (entityId: string) => Promise<void>;
    markWhatsAppSent?: (messageId: string | null) => Promise<void>;
    notify: (content: Buffer, fileName: string, parsed: TParsed) => Promise<{ sent: boolean; messageId: string | null }>;
  },
): Promise<'handled'> {
  const { message, counters } = input;
  const existingSource = await input.findSource();

  const retryNotification = Boolean(
    existingSource
      && !existingSource.whatsappSentAt
      && input.whatsapp
      && input.markWhatsAppSent
      && !input.notifyAttempted.has(message.internetMessageId)
      && isWithinUnimedCgNotifyWindow(message.receivedAt),
  );
  if (existingSource && !retryNotification) {
    counters.skipped += 1;
    return 'handled';
  }

  let sourceUrl: string | null = null;
  let pdf: Buffer | null = null;
  let parsed: TParsed | null = null;
  let fileName = '';

  try {
    const body = await input.getBodyHtml(input.mailbox, message.graphMessageId);
    sourceUrl = extractCliqueAquiUrl(body.content);
    parsed = input.parseBody(body.content);
    if (!parsed || !input.isValid(parsed)) {
      counters.skipped += 1;
      return 'handled';
    }
    fileName = input.buildFileName(parsed);
    pdf = await input.renderHtmlPdf(body.content);
  } catch {
    counters.errors.push(input.sanitizeError('link/pdf'));
    input.logWarn('unimed_cg_email_html_failed');
    return 'handled';
  }

  const notifyWhatsApp = async (content: Buffer) => {
    if (!input.whatsapp || !parsed) return;
    if (!isWithinUnimedCgNotifyWindow(message.receivedAt)) return;
    if (input.notifyAttempted.has(message.internetMessageId)) return;
    input.notifyAttempted.add(message.internetMessageId);

    const result = await input.notify(content, fileName, parsed);
    if (!result.sent) {
      counters.errors.push('aviso WhatsApp falhou');
      return;
    }
    await input.markWhatsAppSent?.(result.messageId);
  };

  if (existingSource) {
    if (pdf) await notifyWhatsApp(pdf);
    counters.skipped += 1;
    return 'handled';
  }

  const existing = await input.findEntity(parsed!);
  const upgrades = existing
    ? input.shouldReplace(existing, parsed!, message.receivedAt)
    : false;

  if (existing && !upgrades) {
    try {
      await input.persistSourceOnly(existing.id);
    } catch (error) {
      counters.failedPersists += 1;
      counters.errors.push(input.sanitizeError(error instanceof Error ? error.message : 'origem'));
      return 'handled';
    }
    counters.skipped += 1;
    return 'handled';
  }

  if (!pdf) {
    counters.skipped += 1;
    return 'handled';
  }

  let itemId: string;
  try {
    const uploaded = await input.uploadPdf({ fileName, content: pdf });
    itemId = uploaded.itemId;
  } catch (error) {
    counters.failedUploads += 1;
    counters.errors.push(input.sanitizeError(error instanceof Error ? error.message : 'upload'));
    input.logWarn('unimed_cg_email_html_upload_failed');
    return 'handled';
  }

  try {
    if (existing) {
      await input.persistUpgrade({
        entityId: existing.id,
        parsed: parsed!,
        fileName,
        oneDriveItemId: itemId,
        sourceUrl,
      });
    } else {
      await input.persistConfirmed({
        parsed: parsed!,
        fileName,
        oneDriveItemId: itemId,
        sourceUrl,
      });
    }
  } catch (error) {
    counters.failedPersists += 1;
    counters.errors.push(input.sanitizeError(error instanceof Error ? error.message : 'persistência'));
    input.logWarn('unimed_cg_email_html_persist_failed');
    await input.collectOrphanUpload(itemId, existing?.oneDriveItemId ?? null);
    return 'handled';
  }

  counters.processed += 1;
  await notifyWhatsApp(pdf);
  return 'handled';
}

export function shouldUpgradeOrNewer(
  existing: { parseStatus: UnimedCgParseStatus; receivedAt?: Date },
  nextStatus: UnimedCgParseStatus,
  receivedAt: Date,
): boolean {
  if (existing.receivedAt && receivedAt.getTime() > existing.receivedAt.getTime()) {
    return true;
  }
  return shouldUpgrade(existing.parseStatus, nextStatus);
}
