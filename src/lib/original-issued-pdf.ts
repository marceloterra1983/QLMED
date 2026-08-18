import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import type { OneDriveItemEntry } from '@/lib/local-xml-sync/sync-types';
import {
  normalizeOneDrivePath,
  oneDriveGraphDownloadFile,
  oneDriveGraphJsonRequest,
} from '@/lib/onedrive-graph';
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
    { allowNotFound: true },
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
    { allowNotFound: true },
  );

  if (!buffer) {
    return null;
  }

  await saveIssuedPdfToFile(invoice.number, buffer, invoice.issueDate);
  return { buffer, filename };
}
