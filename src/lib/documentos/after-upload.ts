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

const log = createLogger('documentos/after-upload');

export type AfterDocumentosUploadInput = {
  companyId: string;
  kind: CompanyDocumentKind;
  documentId: string;
  validUntilYmd: string;
  port?: DocumentosFolderPort;
  alertDeps?: DocumentosAlertDeps;
  now?: Date;
};

/**
 * Pós-upload (FR-007 + FR-011 + FR-016): aviso de renovação e arquivo das
 * vencidas com substituto. Não reverte o upload se WhatsApp/arquivo falharem.
 */
export async function afterDocumentosUpload(input: AfterDocumentosUploadInput): Promise<void> {
  const now = input.now ?? new Date();

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
        await notifyRenewals([event], input.alertDeps);
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
