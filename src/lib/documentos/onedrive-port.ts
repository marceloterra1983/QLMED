import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import {
  downloadOneDriveItemContent,
  listOneDriveChildren,
  type OneDriveItem,
} from '@/lib/onedrive-client';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT, DOCUMENTOS_ONEDRIVE_ROOT } from './constants';
import type { DocumentosFolderFile, DocumentosFolderPort } from './ingest';

function isPdfItem(item: OneDriveItem): boolean {
  if (item.folder) return false;
  const name = item.name || '';
  return name.toLowerCase().endsWith('.pdf') || item.file?.mimeType === 'application/pdf';
}

function sameFolderName(left: string, right: string): boolean {
  return left.normalize('NFC').trim() === right.normalize('NFC').trim();
}

/** Só resolve pastas já existentes — não cria nada no OneDrive de terceiros. */
async function resolveExistingFolderId(
  accessToken: string,
  driveId: string,
  folderPath: string,
): Promise<string> {
  const segments = folderPath.split('/').map((part) => part.trim()).filter(Boolean);
  let currentId = 'root';
  for (const segment of segments) {
    const children = await listOneDriveChildren(accessToken, driveId, currentId);
    const match = children.find((item) => item.folder && sameFolderName(item.name || '', segment));
    if (!match) {
      throw new Error('pasta não encontrada');
    }
    currentId = match.id;
  }
  return currentId;
}

export async function createDocumentosFolderPort(companyId: string): Promise<DocumentosFolderPort> {
  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
  });
  if (!connection) {
    throw new Error('conta faturamento@ não conectada');
  }

  const accessToken = await ensureValidOneDriveAccessToken(connection);
  const { driveId } = connection;
  const folderIdByPath = new Map<string, string>();

  async function folderId(folderName: string): Promise<string> {
    const path = `${DOCUMENTOS_ONEDRIVE_ROOT}/${folderName}`;
    const cached = folderIdByPath.get(path);
    if (cached) return cached;
    const id = await resolveExistingFolderId(accessToken, driveId, path);
    folderIdByPath.set(path, id);
    return id;
  }

  return {
    async listPdfs(folderName: string): Promise<DocumentosFolderFile[]> {
      const id = await folderId(folderName);
      const children = await listOneDriveChildren(accessToken, driveId, id);
      return children.filter(isPdfItem).map((item) => ({
        itemId: item.id,
        name: item.name,
        size: typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : null,
        lastModifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
      }));
    },
    async downloadPdf(itemId: string): Promise<Buffer> {
      return downloadOneDriveItemContent(accessToken, driveId, itemId);
    },
  };
}
