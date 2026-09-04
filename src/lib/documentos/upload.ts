import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { uploadOneDriveFile } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import {
  CERTIDAO_FOLDER,
  CERTIDAO_UPLOAD_NAME,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_ONEDRIVE_ROOT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
  type Kind,
} from './constants';

export type DocumentosUploadKind = Exclude<Kind, 'outro'>;

export class DocumentosOneDriveMissingError extends Error {
  constructor() {
    super(
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

  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId: input.companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
  });
  if (!connection) {
    throw new DocumentosOneDriveMissingError();
  }

  const accessToken = await ensureValidOneDriveAccessToken(connection);
  const fileName = CERTIDAO_UPLOAD_NAME[input.kind](formatDdMmYy(input.validUntil));
  const folderPath = `${DOCUMENTOS_ONEDRIVE_ROOT}/${CERTIDAO_FOLDER[input.kind]}`;
  const uploaded = await uploadOneDriveFile(
    accessToken,
    connection.driveId,
    folderPath,
    fileName,
    input.content,
  );

  const row = await prisma.companyDocument.create({
    data: {
      companyId: input.companyId,
      kind: input.kind,
      fileName,
      oneDriveItemId: uploaded.id,
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      folderName: CERTIDAO_FOLDER[input.kind],
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
}
