import { createLogger } from '@/lib/logger';
import { sanitizeError } from '@/lib/background-service-health';
import {
  GraphMailboxTruncatedError,
  listGraphPdfAttachments,
  listMailboxMessagesBySearch,
  type GraphMailMessage,
  type GraphPdfAttachment,
} from '@/lib/graph-mail-client';
import { uploadOneDriveFile } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import prisma from '@/lib/prisma';
import { looksLikePdf } from '@/lib/pdf/ocr-limits';
import { fold, isCartaComercializacaoCandidate, looksLikeCartaFolderJunk, looksLikeNotaFiscalDocument } from './classify';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT, DOCUMENTOS_UPLOAD_MAX_BYTES, familyByCategory } from './constants';
import { extractPdfPlainText } from './pdf-validity';

const log = createLogger('documentos/carta-mail');

export const CARTA_MAILBOXES = [
  'joseroberto@qlmed.com.br',
  'marcelo@qlmed.com.br',
  'flavio@qlmed.com.br',
  'daniele@qlmed.com.br',
] as const;

/** KQL: carta + tema. Graph $search não distingue acento. */
export const CARTA_MAIL_SEARCH =
  '"carta" AND (comercializacao OR autorizacao OR distribuicao OR representacao)';

/** Páginas Graph por caixa. */
export const CARTA_MAIL_MAX_PAGES = 40;

export type CartaMailScanResult = {
  scanned: number;
  imported: number;
  skipped: number;
  failed: number;
  mailboxes: string[];
};

export type CartaMailPort = {
  listMessages: (mailbox: string, search: string) => Promise<GraphMailMessage[]>;
  listPdfs: (mailbox: string, graphMessageId: string) => Promise<GraphPdfAttachment[]>;
  listExistingNames: () => Promise<string[]>;
  upload: (fileName: string, content: Buffer) => Promise<{ id: string; name: string }>;
};

export function sanitizeCartaFileName(name: string): string {
  const base = name.replace(/\\/g, '/').split('/').pop()?.trim() || 'carta.pdf';
  const cleaned = base
    .replace(/[^\p{L}\w.\- ()]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const withExt = /\.pdf$/i.test(cleaned) ? cleaned : `${cleaned || 'carta'}.pdf`;
  return withExt.slice(0, 180);
}

export function foldedFileKey(name: string): string {
  let key = fold(sanitizeCartaFileName(name));
  // Evita «QL.pdf» / «QL (2).pdf» / «QL assinada.pdf» como linhas distintas.
  key = key.replace(/\(\d+\)/g, ' ');
  key = key.replace(/\bassinad[ao]s?\b/g, ' ');
  return key.replace(/\s+/g, ' ').trim();
}

async function defaultPort(companyId: string): Promise<CartaMailPort> {
  const family = familyByCategory('carta');
  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
  });
  if (!connection) {
    throw new Error('conta faturamento@ não conectada');
  }
  const accessToken = await ensureValidOneDriveAccessToken(connection);

  return {
    listMessages: (mailbox, search) =>
      listMailboxMessagesBySearch(mailbox, search, { maxPages: CARTA_MAIL_MAX_PAGES }),
    listPdfs: (mailbox, graphMessageId) => listGraphPdfAttachments(mailbox, graphMessageId),
    async listExistingNames() {
      const rows = await prisma.companyDocument.findMany({
        where: {
          companyId,
          category: 'carta',
          oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
          removedAt: null,
        },
        select: { fileName: true },
      });
      return rows.map((row) => row.fileName);
    },
    async upload(fileName, content) {
      return uploadOneDriveFile(
        accessToken,
        connection.driveId,
        family.root,
        fileName,
        content,
      );
    },
  };
}

export async function scanCartaMailboxes(
  companyId: string,
  deps?: { port?: CartaMailPort },
): Promise<CartaMailScanResult> {
  const port = deps?.port ?? (await defaultPort(companyId));
  const existing = new Set((await port.listExistingNames()).map(foldedFileKey));
  const result: CartaMailScanResult = {
    scanned: 0,
    imported: 0,
    skipped: 0,
    failed: 0,
    mailboxes: [...CARTA_MAILBOXES],
  };

  for (const mailbox of CARTA_MAILBOXES) {
    let messages: GraphMailMessage[];
    try {
      messages = await port.listMessages(mailbox, CARTA_MAIL_SEARCH);
    } catch (error) {
      if (error instanceof GraphMailboxTruncatedError) {
        messages = error.messages;
        log.warn({ mailbox, pages: error.pages }, 'documentos_carta_mail_truncated');
      } else {
        result.failed += 1;
        log.warn(
          { mailbox, err: sanitizeError(error instanceof Error ? error.message : 'mailbox') },
          'documentos_carta_mail_mailbox_failed',
        );
        continue;
      }
    }

    for (const message of messages) {
      if (!message.hasAttachments) continue;
      let attachments: GraphPdfAttachment[];
      try {
        attachments = await port.listPdfs(mailbox, message.graphMessageId);
      } catch (error) {
        result.failed += 1;
        log.warn(
          { mailbox, err: sanitizeError(error instanceof Error ? error.message : 'attach') },
          'documentos_carta_mail_attach_failed',
        );
        continue;
      }

      for (const attachment of attachments) {
        result.scanned += 1;
        if (!looksLikePdf(attachment.content) || attachment.content.length > DOCUMENTOS_UPLOAD_MAX_BYTES) {
          result.skipped += 1;
          continue;
        }
        // Nome NF/junk → fora sem abrir. OCR só se pdf.js tiver pouco texto
        // (`extractPdfPlainText`); anexos já filtrados por nome, teto 40 páginas.
        if (looksLikeNotaFiscalDocument(attachment.name) || looksLikeCartaFolderJunk(attachment.name)) {
          result.skipped += 1;
          continue;
        }
        let text = '';
        try {
          text = await extractPdfPlainText(attachment.content, { ocrFallback: true });
        } catch {
          text = '';
        }
        if (!isCartaComercializacaoCandidate(attachment.name, message.subject, text)) {
          result.skipped += 1;
          continue;
        }
        const fileName = sanitizeCartaFileName(attachment.name);
        const key = foldedFileKey(fileName);
        if (existing.has(key)) {
          result.skipped += 1;
          continue;
        }
        try {
          await port.upload(fileName, attachment.content);
          existing.add(key);
          result.imported += 1;
        } catch (error) {
          result.failed += 1;
          log.warn(
            { mailbox, err: sanitizeError(error instanceof Error ? error.message : 'upload') },
            'documentos_carta_mail_upload_failed',
          );
        }
      }
    }
  }

  log.info(
    {
      scanned: result.scanned,
      imported: result.imported,
      skipped: result.skipped,
      failed: result.failed,
    },
    'documentos_carta_mail_ok',
  );
  return result;
}
