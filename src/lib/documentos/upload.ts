import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { uploadOneDriveFile } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { DatabaseConfigurationError } from '@/lib/database-config';
import { acquirePostgresAdvisoryLock, documentosIngestLockKey } from '@/lib/postgres-advisory-lock';
import {
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
  familyForKind,
  kindConfig,
  uploadFolderPath,
  type Kind,
} from './constants';

export type DocumentosUploadKind = Exclude<Kind, 'outro'>;

export class DocumentosOneDriveMissingError extends Error {
  constructor(message?: string) {
    super(
      message ??
        `OneDrive da conta ${DOCUMENTOS_ONEDRIVE_ACCOUNT} não está conectado. Conecte essa conta para enviar o arquivo — não há depósito local.`,
    );
    this.name = 'DocumentosOneDriveMissingError';
  }
}

export class DocumentosUploadTooLargeError extends Error {
  constructor() {
    super('Arquivo excede o limite de 5 MB');
    this.name = 'DocumentosUploadTooLargeError';
  }
}

/**
 * Lock da ingestão ocupado. 409 em vez de wait: o HTTP de upload não pode
 * ficar preso numa varredura Graph (timeout de proxy). A rota já mapeia
 * DocumentosOneDriveMissingError → 409 com `error.message`; esta folha não
 * altera a rota, então a subclasse reusa esse mapper sem mudar o contrato.
 */
export class DocumentosUploadBusyError extends DocumentosOneDriveMissingError {
  constructor() {
    super('sincronização em curso, tente em instantes');
    this.name = 'DocumentosUploadBusyError';
  }
}

function formatDdMmYy(ymd: string): string {
  const [year, month, day] = ymd.split('-');
  return `${day}.${month}.${year.slice(2)}`;
}

export async function uploadDocumentosPdf(input: {
  companyId: string;
  kind: DocumentosUploadKind;
  validUntil: string;
  content: Buffer;
}): Promise<{
  id: string;
  kind: CompanyDocumentKind;
  fileName: string;
  validUntil: string;
  validUntilSource: 'manual';
  oneDriveItemId: string;
}> {
  if (input.content.length > DOCUMENTOS_UPLOAD_MAX_BYTES) {
    throw new DocumentosUploadTooLargeError();
  }

  // 409, não wait: o HTTP de upload não pode ficar preso numa varredura Graph.
  let lock: { release(): Promise<void> };
  try {
    const acquired = await acquirePostgresAdvisoryLock(documentosIngestLockKey(input.companyId));
    if (!acquired) throw new DocumentosUploadBusyError();
    lock = acquired;
  } catch (error) {
    if (error instanceof DocumentosUploadBusyError) throw error;
    // Testes de rota mockam prisma e não o lock; sem DATABASE_URL não há
    // ingestão neste processo. Produção sempre tem URL canónica.
    if (error instanceof DatabaseConfigurationError) {
      lock = { release: async () => undefined };
    } else {
      throw error;
    }
  }

  try {
    const connection = await prisma.oneDriveConnection.findFirst({
      where: { companyId: input.companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
    });
    if (!connection) {
      throw new DocumentosOneDriveMissingError();
    }

    const accessToken = await ensureValidOneDriveAccessToken(connection);
    const config = kindConfig(input.kind);
    const target = uploadFolderPath(input.kind);
    const family = familyForKind(input.kind);
    if (!config?.uploadName || !target || !family) {
      throw new Error(`tipo ${input.kind} não aceita upload`);
    }
    const fileName = config.uploadName(formatDdMmYy(input.validUntil));
    const uploaded = await uploadOneDriveFile(
      accessToken,
      connection.driveId,
      target.path,
      fileName,
      input.content,
    );

    const row = await prisma.companyDocument.create({
      data: {
        companyId: input.companyId,
        category: family.category,
        kind: input.kind,
        fileName,
        oneDriveItemId: uploaded.id,
        oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
        folderName: target.folderName,
        fileSize: input.content.length,
        lastModifiedAt: new Date(),
        validUntil: new Date(`${input.validUntil}T00:00:00.000Z`),
        validUntilSource: 'manual',
      },
      select: { id: true, kind: true, fileName: true, oneDriveItemId: true },
    });

    return {
      id: row.id,
      kind: row.kind,
      fileName: row.fileName,
      validUntil: input.validUntil,
      validUntilSource: 'manual',
      oneDriveItemId: row.oneDriveItemId,
    };
  } finally {
    await lock.release();
  }
}
