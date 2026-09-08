import { createLogger } from '@/lib/logger';
import { ensureOneDriveFolder, uploadOneDriveFile } from '@/lib/onedrive-client';
import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import {
  buildIssuedNfePdfFileName,
  buildXmlFileName,
  getMonthFolder,
} from '@/lib/xml-file-store';

const log = createLogger('nfe-emission/onedrive-backup');

const DEFAULT_XML_ROOT = '/BACKUP_QL MED/NFE/XML';
const DEFAULT_PDF_ROOT = '/BACKUP_QL MED/NFE/Danfes';
const EMPTY_PATHS = { xmlPath: null, pdfPath: null } as const;

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function issuedOneDriveXmlRoot(): string {
  return stripTrailingSlash((process.env.LOCAL_XML_ONEDRIVE_XML_PATH || DEFAULT_XML_ROOT).trim());
}

export function issuedOneDrivePdfRoot(): string {
  return stripTrailingSlash((process.env.LOCAL_XML_ONEDRIVE_PDF_PATH || DEFAULT_PDF_ROOT).trim());
}

export function issuedOneDriveXmlFolder(issueDate: Date | string | null): string {
  return `${issuedOneDriveXmlRoot()}/${getMonthFolder(issueDate)}`;
}

export function issuedOneDrivePdfFolder(issueDate: Date | string | null): string {
  return `${issuedOneDrivePdfRoot()}/${getMonthFolder(issueDate)}`;
}

export async function uploadIssuedNfeToOneDrive(input: {
  companyId: string;
  accessKey: string;
  invoiceNumber: string;
  issueDate: Date | string | null;
  xml: string;
  pdf?: Buffer | null;
}): Promise<{ xmlPath: string | null; pdfPath: string | null }> {
  try {
    const xmlName = buildXmlFileName(input.accessKey, 'NFE');
    if (!xmlName) {
      return { ...EMPTY_PATHS };
    }

    const { accessToken, driveId } = await resolveAccountOneDrive(input.companyId);

    const xmlFolder = issuedOneDriveXmlFolder(input.issueDate);
    await ensureOneDriveFolder(accessToken, driveId, xmlFolder);
    await uploadOneDriveFile(
      accessToken,
      driveId,
      xmlFolder,
      xmlName,
      Buffer.from(input.xml, 'utf8'),
      'application/xml',
    );

    let pdfPath: string | null = null;
    const pdfName = input.pdf && input.pdf.length > 0
      ? buildIssuedNfePdfFileName(input.invoiceNumber)
      : null;
    if (input.pdf && pdfName) {
      const pdfFolder = issuedOneDrivePdfFolder(input.issueDate);
      await ensureOneDriveFolder(accessToken, driveId, pdfFolder);
      await uploadOneDriveFile(
        accessToken,
        driveId,
        pdfFolder,
        pdfName,
        input.pdf,
        'application/pdf',
      );
      pdfPath = `${pdfFolder}/${pdfName}`;
    }

    return { xmlPath: `${xmlFolder}/${xmlName}`, pdfPath };
  } catch (err) {
    log.error({ err, invoiceNumber: input.invoiceNumber }, 'Falha ao gravar NF-e no OneDrive');
    return { ...EMPTY_PATHS };
  }
}
