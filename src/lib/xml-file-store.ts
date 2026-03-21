import { promises as fs } from 'fs';
import path from 'path';

const XML_BACKUP_DIR = process.env.LOCAL_XML_BACKUP_DIR
  || process.env.LOCAL_XML_COPY_TARGET_DIR
  || path.join(process.cwd(), 'xml_backup');
const PDF_BACKUP_DIR = process.env.LOCAL_PDF_BACKUP_DIR
  || path.join(path.dirname(XML_BACKUP_DIR), 'pdf_backup');

const TYPE_SUFFIX: Record<string, string> = {
  NFE: 'nfe',
  CTE: 'cte',
  NFSE: 'nfse',
};

export function getMonthFolder(issueDate: Date | string | null): string {
  if (!issueDate) {
    const now = new Date();
    return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  const d = typeof issueDate === 'string' ? new Date(issueDate) : issueDate;
  if (isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function buildFileName(accessKey: string, type: string): string {
  const suffix = TYPE_SUFFIX[type] || type.toLowerCase();
  return `${accessKey}-${suffix}.xml`;
}

function normalizeInvoiceNumber(number: string): string {
  return String(number || '').replace(/\D/g, '');
}

export function buildIssuedNfePdfFileName(invoiceNumber: string): string | null {
  const normalized = normalizeInvoiceNumber(invoiceNumber);
  if (!normalized) return null;
  return `Danfe_NF${normalized.padStart(9, '0')}.pdf`;
}

function getIssuedPdfFilePath(invoiceNumber: string, issueDate: Date | string | null): string | null {
  const fileName = buildIssuedNfePdfFileName(invoiceNumber);
  if (!fileName) return null;
  return path.join(PDF_BACKUP_DIR, getMonthFolder(issueDate), fileName);
}

async function writeBufferToFileIfNeeded(filePath: string, content: Buffer | Uint8Array): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size >= content.byteLength) return filePath;
  } catch {
    // File does not exist yet.
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, content);
  return filePath;
}

export async function saveXmlToFile(
  accessKey: string,
  type: string,
  xmlContent: string,
  issueDate: Date | string | null,
): Promise<string | null> {
  if (!accessKey || !xmlContent) return null;

  try {
    const monthFolder = getMonthFolder(issueDate);
    const dir = path.join(XML_BACKUP_DIR, monthFolder);
    await fs.mkdir(dir, { recursive: true });

    const fileName = buildFileName(accessKey, type);
    const filePath = path.join(dir, fileName);

    // Skip if file already exists with same or larger size
    try {
      const stats = await fs.stat(filePath);
      if (stats.size >= xmlContent.length) return filePath;
    } catch {
      // File doesn't exist — write it
    }

    await fs.writeFile(filePath, xmlContent, 'utf-8');
    return filePath;
  } catch (error) {
    // Non-critical — log but don't throw
    console.error(`[XmlFileStore] Erro ao salvar XML ${accessKey}:`, (error as Error).message);
    return null;
  }
}

export async function savePdfToMonthFolder(
  monthFolder: string,
  fileName: string,
  pdfContent: Buffer | Uint8Array,
): Promise<string | null> {
  if (!monthFolder || !fileName || !pdfContent?.byteLength) return null;

  try {
    const filePath = path.join(PDF_BACKUP_DIR, monthFolder, fileName);
    return await writeBufferToFileIfNeeded(filePath, pdfContent);
  } catch (error) {
    console.error(`[XmlFileStore] Erro ao salvar PDF ${fileName}:`, (error as Error).message);
    return null;
  }
}

export async function saveIssuedPdfToFile(
  invoiceNumber: string,
  pdfContent: Buffer | Uint8Array,
  issueDate: Date | string | null,
): Promise<string | null> {
  const fileName = buildIssuedNfePdfFileName(invoiceNumber);
  if (!fileName) return null;
  return savePdfToMonthFolder(getMonthFolder(issueDate), fileName, pdfContent);
}

export async function readIssuedPdfFromFile(
  invoiceNumber: string,
  issueDate: Date | string | null,
): Promise<Buffer | null> {
  const filePath = getIssuedPdfFilePath(invoiceNumber, issueDate);
  if (!filePath) return null;

  try {
    return await fs.readFile(filePath);
  } catch (err) {
    console.error('[XmlFileStore] Failed to read PDF file:', filePath, (err as Error).message);
    return null;
  }
}
