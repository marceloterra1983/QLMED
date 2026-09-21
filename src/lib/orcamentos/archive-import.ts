import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  GraphMailboxTruncatedError,
  listGraphPdfAttachments,
  listMailboxMessagesBySearch,
  type GraphMailMessage,
  type GraphPdfAttachment,
} from '@/lib/graph-mail-client';
import { QUOTE_CLOSING_CONTACTS } from './issuer';
import { QUOTE_ARCHIVE_ROOT, upsertQuoteArchiveFromPdf, type QuoteArchiveOrigin } from './archive-store';

export const QLMED_QUOTE_MAILBOXES = QUOTE_CLOSING_CONTACTS.map((row) => row.email);

let importRunning = false;

export function looksLikeQuotePdf(subject: string, fileName: string): boolean {
  const hay = `${subject} ${fileName}`.toLowerCase();
  return hay.includes('orçamento') || hay.includes('orcamento') || hay.includes('orçament') || /orcament/i.test(hay);
}

function safeFileName(name: string): string {
  return name.replace(/[^\w.\- áéíóúãõçÁÉÍÓÚÃÕÇ]+/g, '_').slice(0, 120) || 'orcamento.pdf';
}

async function walkPdfs(dir: string, acc: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkPdfs(full, acc);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf') && looksLikeQuotePdf('', entry.name)) {
      acc.push(full);
    }
  }
}

export type QuoteArchiveImportPorts = {
  listMessages?: typeof listMailboxMessagesBySearch;
  listAttachments?: typeof listGraphPdfAttachments;
  upsert?: typeof upsertQuoteArchiveFromPdf;
  writePdf?: (filePath: string, content: Buffer) => Promise<void>;
};

export async function importQuoteArchivesFromDirectory(
  companyId: string,
  dir: string,
  sourceKind: QuoteArchiveOrigin,
  upsert: typeof upsertQuoteArchiveFromPdf = upsertQuoteArchiveFromPdf,
): Promise<{ imported: number; skipped: number; failed: number }> {
  const files: string[] = [];
  await walkPdfs(dir, files);
  let imported = 0;
  let skipped = 0;
  let failed = 0;
  for (const filePath of files) {
    try {
      const result = await upsert({ companyId, filePath, sourceKind });
      if (!result || result.skipped) skipped += 1;
      else imported += 1;
    } catch {
      failed += 1;
    }
  }
  return { imported, skipped, failed };
}

async function messagesOfMailbox(
  mailbox: string,
  listMessages: typeof listMailboxMessagesBySearch,
): Promise<GraphMailMessage[]> {
  try {
    return await listMessages(mailbox, 'orçamento', { maxPages: 40 });
  } catch (error) {
    if (error instanceof GraphMailboxTruncatedError) return error.messages;
    throw error;
  }
}

export async function collectQuoteArchivesFromMail(
  companyId: string,
  ports: QuoteArchiveImportPorts = {},
): Promise<{ imported: number; skipped: number; failed: number; mailboxes: string[] }> {
  const listMessages = ports.listMessages ?? listMailboxMessagesBySearch;
  const listAttachments = ports.listAttachments ?? listGraphPdfAttachments;
  const upsert = ports.upsert ?? upsertQuoteArchiveFromPdf;
  const writePdf =
    ports.writePdf ??
    (async (filePath: string, content: Buffer) => {
      await mkdir(path.dirname(filePath), { recursive: true });
      await writeFile(filePath, content);
    });

  let imported = 0;
  let skipped = 0;
  let failed = 0;
  const seen = new Set<string>();

  for (const mailbox of QLMED_QUOTE_MAILBOXES) {
    const messages = await messagesOfMailbox(mailbox, listMessages);
    for (const message of messages) {
      if (!message.hasAttachments || !looksLikeQuotePdf(message.subject, '')) continue;
      let pdfs: GraphPdfAttachment[];
      try {
        pdfs = await listAttachments(mailbox, message.graphMessageId);
      } catch {
        failed += 1;
        continue;
      }
      const day = message.receivedAt.toISOString().slice(0, 10);
      const who = mailbox.split('@')[0];
      for (const pdf of pdfs) {
        if (!looksLikeQuotePdf(message.subject, pdf.name)) continue;
        const dest = path.join(QUOTE_ARCHIVE_ROOT, '_email', who, `${day}_${safeFileName(pdf.name)}`);
        if (seen.has(dest)) continue;
        seen.add(dest);
        try {
          await writePdf(dest, pdf.content);
          const result = await upsert({
            companyId,
            filePath: dest,
            sourceKind: 'email',
            sourceMailbox: mailbox,
            sourceSubject: message.subject,
          });
          if (!result || result.skipped) skipped += 1;
          else imported += 1;
        } catch {
          failed += 1;
        }
      }
    }
  }
  return { imported, skipped, failed, mailboxes: [...QLMED_QUOTE_MAILBOXES] };
}

export async function runQuoteArchiveImport(
  companyId: string,
  source: 'disk' | 'mail' | 'all' = 'all',
  ports: QuoteArchiveImportPorts = {},
): Promise<
  | { busy: true }
  | {
      busy: false;
      mail?: Awaited<ReturnType<typeof collectQuoteArchivesFromMail>>;
      diskEmail?: Awaited<ReturnType<typeof importQuoteArchivesFromDirectory>>;
      diskArquivo?: Awaited<ReturnType<typeof importQuoteArchivesFromDirectory>>;
    }
> {
  if (importRunning) return { busy: true };
  importRunning = true;
  try {
    const upsert = ports.upsert ?? upsertQuoteArchiveFromPdf;
    const mail = source === 'disk' ? undefined : await collectQuoteArchivesFromMail(companyId, ports);
    const diskEmail =
      source === 'mail'
        ? undefined
        : await importQuoteArchivesFromDirectory(companyId, path.join(QUOTE_ARCHIVE_ROOT, '_email'), 'email', upsert);
    const diskArquivo =
      source === 'mail'
        ? undefined
        : await importQuoteArchivesFromDirectory(companyId, path.join(QUOTE_ARCHIVE_ROOT, '_arquivo'), 'arquivo', upsert);
    return { busy: false, mail, diskEmail, diskArquivo };
  } finally {
    importRunning = false;
  }
}
