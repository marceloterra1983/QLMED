import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  isPdfItem,
  listOneDriveChildren,
} from '@/lib/onedrive-client';
import { resolveAccountOneDrive } from '@/lib/onedrive-connections';

export type OneDriveFolderFile = {
  itemId: string;
  name: string;
  lastModifiedAt: Date | null;
};

export type OneDriveFolderPort = {
  listPdfs(): Promise<OneDriveFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
};

export type CreateOneDriveFolderPortOptions = {
  companyId: string;
  accountEmail: string;
  folderName: string;
  allowFallback?: boolean;
  errorMessage?: string;
};

/**
 * Deep Module: encapsula resolução de conexão OneDrive, descoberta de pasta raiz,
 * paginação e filtragem de arquivos PDF em um contrato unificado e reutilizável.
 */
export async function createOneDriveFolderPort(
  options: CreateOneDriveFolderPortOptions,
): Promise<OneDriveFolderPort> {
  const { accessToken, driveId } = await resolveAccountOneDrive(
    options.companyId,
    options.accountEmail,
    {
      allowFallback: options.allowFallback,
      errorMessage: options.errorMessage ?? 'conta de arquivo nao conectada',
    },
  );
  const folder = await ensureOneDriveFolder(accessToken, driveId, options.folderName);

  return {
    async listPdfs() {
      const children = await listOneDriveChildren(accessToken, driveId, folder.id);
      return children.filter(isPdfItem).map((item) => ({
        itemId: item.id,
        name: item.name,
        lastModifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
      }));
    },
    async downloadPdf(itemId: string) {
      return downloadOneDriveItemContent(accessToken, driveId, itemId);
    },
  };
}
