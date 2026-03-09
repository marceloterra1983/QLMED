import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import {
  buildIssuedNfePdfFileName,
  getMonthFolder,
  readIssuedPdfFromFile,
  saveIssuedPdfToFile,
} from '@/lib/xml-file-store';

const ONEDRIVE_ISSUED_PDF_ROOT_PATH = (
  process.env.LOCAL_XML_ONEDRIVE_PDF_PATH || '/BACKUP_QL MED/NFE/Danfes'
).trim();

type OriginalIssuedPdfInvoice = {
  companyId: string;
  type: string;
  direction: string;
  number: string;
  issueDate: Date | string | null;
};

type OneDriveItemEntry = {
  id: string;
  name: string;
  file?: {
    mimeType?: string;
  };
};

function normalizeOneDrivePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

async function oneDriveGraphJsonRequest<T>(accessToken: string, resourcePath: string): Promise<T | null> {
  const endpoint = resourcePath.startsWith('http')
    ? resourcePath
    : `https://graph.microsoft.com/v1.0${resourcePath}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object'
      ? JSON.stringify(payload).slice(0, 300)
      : `${response.status} ${response.statusText}`;
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }

  return payload as T;
}

async function oneDriveGraphDownloadFile(accessToken: string, resourcePath: string): Promise<Buffer | null> {
  const endpoint = resourcePath.startsWith('http')
    ? resourcePath
    : `https://graph.microsoft.com/v1.0${resourcePath}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status} ${response.statusText}`);
    throw new Error(`Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }

  const data = await response.arrayBuffer();
  return Buffer.from(data);
}

async function resolveOneDriveItemByPath(
  accessToken: string,
  driveId: string,
  itemPath: string,
): Promise<OneDriveItemEntry | null> {
  const encodedDriveId = encodeURIComponent(driveId);
  const normalizedPath = normalizeOneDrivePath(itemPath);
  return oneDriveGraphJsonRequest<OneDriveItemEntry>(
    accessToken,
    `/drives/${encodedDriveId}/root:${encodeURI(normalizedPath)}?$select=id,name,file`,
  );
}

function isSupportedIssuedNfe(invoice: OriginalIssuedPdfInvoice): boolean {
  return invoice.type === 'NFE'
    && invoice.direction === 'issued'
    && Boolean(buildIssuedNfePdfFileName(invoice.number));
}

export async function getOriginalIssuedPdf(
  invoice: OriginalIssuedPdfInvoice,
): Promise<{ buffer: Buffer; filename: string } | null> {
  if (!isSupportedIssuedNfe(invoice)) {
    return null;
  }

  const filename = buildIssuedNfePdfFileName(invoice.number);
  if (!filename) {
    return null;
  }

  const localPdf = await readIssuedPdfFromFile(invoice.number, invoice.issueDate);
  if (localPdf) {
    return { buffer: localPdf, filename };
  }

  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId: invoice.companyId },
    orderBy: { updatedAt: 'desc' },
  });

  if (!connection) {
    return null;
  }

  const accessToken = await ensureValidOneDriveAccessToken(connection);
  const monthFolder = getMonthFolder(invoice.issueDate);
  const remotePath = `${normalizeOneDrivePath(ONEDRIVE_ISSUED_PDF_ROOT_PATH)}/${monthFolder}/${filename}`;
  const item = await resolveOneDriveItemByPath(accessToken, connection.driveId, remotePath);

  if (!item?.file) {
    return null;
  }

  const encodedDriveId = encodeURIComponent(connection.driveId);
  const encodedItemId = encodeURIComponent(item.id);
  const buffer = await oneDriveGraphDownloadFile(
    accessToken,
    `/drives/${encodedDriveId}/items/${encodedItemId}/content`,
  );

  if (!buffer) {
    return null;
  }

  await saveIssuedPdfToFile(invoice.number, buffer, invoice.issueDate);
  return { buffer, filename };
}
