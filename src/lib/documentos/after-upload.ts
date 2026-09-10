import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import {
  archiveExpiredDocuments,
  sanitizeError,
  type DocumentosFolderPort,
  type RenewalEvent,
} from './ingest';
import { notifyRenewals, type DocumentosAlertDeps } from './alerts';
import { kindExpires } from './constants';
import { createDocumentosFolderPort } from './onedrive-port';
import { selectVigente, toYmd } from './validity';
import { notifyDocumentUpdateByEmail } from './update-email';
import type { MailTransport } from './share-email';

const log = createLogger('documentos/after-upload');

export type AfterDocumentosUploadInput = {
  companyId: string;
  kind: CompanyDocumentKind;
  documentId: string;
  validUntilYmd: string;
  /** PDF do upload — evita re-download no e-mail FR-046. */
  pdf?: Buffer;
  port?: DocumentosFolderPort;
  alertDeps?: DocumentosAlertDeps;
  mailTransport?: MailTransport;
  now?: Date;
};

/**
 * Pós-upload (FR-007 + FR-011 + FR-016 + FR-046): e-mail com anexo e tabela
 * resumo; aviso de renovação WhatsApp; arquivo das vencidas com substituto.
 * Não reverte o upload se WhatsApp/e-mail/arquivo falharem.
 */
export async function afterDocumentosUpload(input: AfterDocumentosUploadInput): Promise<void> {
  const now = input.now ?? new Date();

  try {
    await notifyDocumentUpdateByEmail({
      companyId: input.companyId,
      documentId: input.documentId,
      pdf: input.pdf,
      port: input.port,
      mailTransport: input.mailTransport ?? input.alertDeps?.mailTransport,
      now,
    });
  } catch (error) {
    log.warn(
      {
        documentId: input.documentId,
        kind: input.kind,
        err: sanitizeError(error instanceof Error ? error.message : 'update-email'),
      },
      'documentos_upload_update_email_failed',
    );
  }

  if (kindExpires(input.kind)) {
    try {
      const siblings = await prisma.companyDocument.findMany({
        where: {
          companyId: input.companyId,
          kind: input.kind,
          removedAt: null,
          id: { not: input.documentId },
        },
        select: {
          id: true,
          kind: true,
          fileName: true,
          oneDriveItemId: true,
          validUntil: true,
          removedAt: true,
          alertedThresholds: true,
        },
      });
      const previous = selectVigente(siblings).get(input.kind);
      const previousYmd = previous ? toYmd(previous.validUntil) : null;
      if (previous && previousYmd && input.validUntilYmd > previousYmd) {
        const event: RenewalEvent = {
          companyId: input.companyId,
          kind: input.kind,
          documentId: input.documentId,
          previousValidUntil: previousYmd,
          validUntil: input.validUntilYmd,
        };
        // E-mail já saiu acima (FR-046); aqui só WhatsApp / carimbo renewal.
        await notifyRenewals([event], { ...input.alertDeps, skipEmail: true });
      }
    } catch (error) {
      log.warn(
        {
          documentId: input.documentId,
          kind: input.kind,
          err: sanitizeError(error instanceof Error ? error.message : 'renewal'),
        },
        'documentos_upload_renewal_failed',
      );
    }
  }

  try {
    const port = input.port ?? (await createDocumentosFolderPort(input.companyId));
    await archiveExpiredDocuments(input.companyId, port, now);
  } catch (error) {
    log.warn(
      {
        documentId: input.documentId,
        kind: input.kind,
        err: sanitizeError(error instanceof Error ? error.message : 'archive'),
      },
      'documentos_upload_archive_failed',
    );
  }
}
