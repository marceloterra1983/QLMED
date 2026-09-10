import { createLogger } from '@/lib/logger';
import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  isPdfItem,
  listOneDriveChildren,
  moveOneDriveItem,
} from '@/lib/onedrive-client';
import { CERTIDAO_ARCHIVE_FOLDER, DOCUMENTOS_ONEDRIVE_ACCOUNT, familyByCategory } from './constants';
import type { DocumentosFolderFile, DocumentosFolderPort } from './ingest';

const log = createLogger('documentos/onedrive-port');

function sameFolderName(left: string, right: string): boolean {
  return left.normalize('NFC').trim() === right.normalize('NFC').trim();
}

/** Resolve pastas de leitura já existentes. Arquivo (Vencidas) pode criar a pasta sob a raiz. */
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
  const { accessToken, driveId } = await resolveAccountOneDrive(companyId, DOCUMENTOS_ONEDRIVE_ACCOUNT, {
    allowFallback: false,
    errorMessage: 'conta faturamento@ não conectada',
  });
  const folderIdByPath = new Map<string, string>();

  async function folderId(folderPath: string): Promise<string> {
    const cached = folderIdByPath.get(folderPath);
    if (cached) return cached;
    const id = await resolveExistingFolderId(accessToken, driveId, folderPath);
    folderIdByPath.set(folderPath, id);
    return id;
  }

  const vencidasIdByRoot = new Map<string, string>();

  async function resolveVencidasId(familyRoot: string): Promise<string> {
    const cached = vencidasIdByRoot.get(familyRoot);
    if (typeof cached === 'string') return cached;

    // Raiz da família tem de existir; só criamos Vencidas sob ela (FR-016).
    const rootId = await resolveExistingFolderId(accessToken, driveId, familyRoot);
    const children = await listOneDriveChildren(accessToken, driveId, rootId);
    const match = children.find(
      (item) => item.folder && sameFolderName(item.name || '', CERTIDAO_ARCHIVE_FOLDER),
    );
    if (match) {
      vencidasIdByRoot.set(familyRoot, match.id);
      return match.id;
    }

    const created = await ensureOneDriveFolder(
      accessToken,
      driveId,
      `${familyRoot}/${CERTIDAO_ARCHIVE_FOLDER}`,
    );
    log.info({ folder: CERTIDAO_ARCHIVE_FOLDER, root: familyRoot }, 'documentos_archive_folder_created');
    vencidasIdByRoot.set(familyRoot, created.id);
    return created.id;
  }

  return {
    async listPdfs(folderPath: string): Promise<DocumentosFolderFile[]> {
      const id = await folderId(folderPath);
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
    async moveToArchive(itemId: string, familyRoot: string = familyByCategory('certidao').root): Promise<void> {
      const parentId = await resolveVencidasId(familyRoot);
      await moveOneDriveItem(accessToken, driveId, itemId, parentId);
    },
  };
}
