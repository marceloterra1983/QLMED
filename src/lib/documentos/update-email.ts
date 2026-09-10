import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { cartaLabelFromFileName } from './classify';
import { familyForKind, labelForKind } from './constants';
import {
  loadDocumentosListing,
  type DocumentosListing,
  type DocumentosRow,
} from './list';
import {
  DOCUMENTOS_RENEWAL_EMAIL_RECIPIENTS,
  buildDocumentosSummaryHtml,
  buildDocumentosSummaryText,
  categoryLabelForSummary,
  shareDocumentByEmail,
  type DocumentosSummaryRow,
  type MailTransport,
  type ShareResult,
} from './share-email';
import { createDocumentosFolderPort } from './onedrive-port';
import { sanitizeError, type DocumentosFolderPort } from './ingest';
import { toYmd } from './validity';

const log = createLogger('documentos/update-email');

export type NotifyDocumentUpdateEmailInput = {
  companyId: string;
  documentId: string;
  /** PDF já baixado (upload) — evita segundo download. */
  pdf?: Buffer;
  port?: DocumentosFolderPort;
  mailTransport?: MailTransport;
  listing?: DocumentosListing;
  now?: Date;
};

function flattenListing(listing: DocumentosListing): DocumentosRow[] {
  return [
    ...listing.certidoes,
    ...listing.sanitaria,
    ...listing.cartas,
    ...listing.societario,
    ...listing.basicos,
    ...listing.balancos,
  ];
}

export function listingToSummaryRows(listing: DocumentosListing): DocumentosSummaryRow[] {
  return flattenListing(listing).map((row) => ({
    categoryLabel: categoryLabelForSummary(row.category),
    label: row.label,
    fileName: row.fileName,
    validUntil: row.validUntil,
    statusLabel: row.status.label,
  }));
}

function kindLabelOf(kind: CompanyDocumentKind, fileName: string): string {
  const family = familyForKind(kind);
  if (family?.mode === 'open') return cartaLabelFromFileName(fileName);
  return labelForKind(kind);
}

/**
 * FR-046: e-mail de atualização com PDF em anexo e tabela resumo de todos
 * os documentos vigentes. Remetente adm@qlmed.com.br (SMTP_USER).
 * Falha de SMTP não propaga — o upload/ingestão já gravado não reverte.
 */
export async function notifyDocumentUpdateByEmail(
  input: NotifyDocumentUpdateEmailInput,
): Promise<ShareResult | null> {
  const now = input.now ?? new Date();
  const row = await prisma.companyDocument.findFirst({
    where: { id: input.documentId, companyId: input.companyId, removedAt: null },
    select: {
      id: true,
      kind: true,
      fileName: true,
      oneDriveItemId: true,
      validUntil: true,
    },
  });
  if (!row) return null;

  let pdf = input.pdf;
  if (!pdf) {
    const port = input.port ?? (await createDocumentosFolderPort(input.companyId));
    try {
      pdf = await port.downloadPdf(row.oneDriveItemId);
    } catch (error) {
      log.warn(
        {
          documentId: row.id,
          err: sanitizeError(error instanceof Error ? error.message : 'download'),
        },
        'documentos_update_email_download_failed',
      );
      return null;
    }
  }

  const listing = input.listing ?? (await loadDocumentosListing(input.companyId, now));
  const summaryRows = listingToSummaryRows(listing);
  const kindLabel = kindLabelOf(row.kind, row.fileName);
  const validUntil = toYmd(row.validUntil);

  try {
    const result = await shareDocumentByEmail(
      {
        recipients: [...DOCUMENTOS_RENEWAL_EMAIL_RECIPIENTS],
        fileName: row.fileName,
        pdf,
        kindLabel,
        validUntil,
        note: `Documento atualizado: ${kindLabel}.`,
        htmlExtra: buildDocumentosSummaryHtml(summaryRows),
        textExtra: buildDocumentosSummaryText(summaryRows),
      },
      { transport: input.mailTransport },
    );
    log.info({ documentId: row.id, kind: row.kind }, 'documentos_update_email_sent');
    return result;
  } catch (error) {
    log.warn(
      {
        documentId: row.id,
        kind: row.kind,
        err: sanitizeError(error instanceof Error ? error.message : 'email'),
      },
      'documentos_update_email_failed',
    );
    return null;
  }
}
