import { promises as fs } from 'fs';
import path from 'path';
import { createLogger } from '@/lib/logger';

const log = createLogger('xml-file-store');

const XML_BACKUP_DIR = process.env.LOCAL_XML_BACKUP_DIR
  || process.env.LOCAL_XML_COPY_TARGET_DIR
  || path.join(process.cwd(), 'xml_backup');
const PDF_BACKUP_DIR = process.env.LOCAL_PDF_BACKUP_DIR
  || path.join(path.dirname(XML_BACKUP_DIR), 'pdf_backup');

/** Só o dono lê: o XML fiscal carrega dados de cliente (auditoria FILE-008). */
const FILE_MODE = 0o600;
const DIR_MODE = 0o700;

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

/**
 * Segmento de empresa no caminho. `companyId` é um cuid/uuid vindo do banco,
 * mas isto é caminho de ficheiro: valida em vez de confiar.
 */
export function buildCompanySegment(companyId: string): string | null {
  if (!companyId || !/^[A-Za-z0-9_-]+$/.test(companyId)) return null;
  return companyId;
}

export function buildXmlFileName(accessKey: string, type: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(accessKey)) return null;

  const suffix = TYPE_SUFFIX[type] || type.toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(suffix)) return null;
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

/**
 * Caminhos candidatos, na ordem de preferência: primeiro o layout novo, com a
 * empresa; depois o legado, sem ela. A leitura cai no legado para não perder o
 * que já está gravado no volume — migrar os ficheiros antigos é operação de
 * volume, não desta função.
 */
function candidatePaths(
  baseDir: string,
  companyId: string | null,
  monthFolder: string,
  fileName: string,
): string[] {
  const paths: string[] = [];
  const segment = companyId ? buildCompanySegment(companyId) : null;
  if (segment) paths.push(path.join(baseDir, segment, monthFolder, fileName));
  paths.push(path.join(baseDir, monthFolder, fileName));
  return paths;
}

/** Escreve em ficheiro temporário e renomeia: nunca deixa ficheiro meio escrito. */
async function writeFileAtomic(filePath: string, content: string | Buffer | Uint8Array): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: DIR_MODE });
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  try {
    await fs.writeFile(tmpPath, content, { mode: FILE_MODE });
    await fs.rename(tmpPath, filePath);
  } catch (err) {
    await fs.rm(tmpPath, { force: true }).catch(() => {});
    throw err;
  }
}

async function writeBufferToFileIfNeeded(filePath: string, content: Buffer | Uint8Array): Promise<string> {
  try {
    const stats = await fs.stat(filePath);
    if (stats.size >= content.byteLength) return filePath;
  } catch {
    // File does not exist yet.
  }

  await writeFileAtomic(filePath, content);
  return filePath;
}

export async function saveXmlToFile(
  companyId: string,
  accessKey: string,
  type: string,
  xmlContent: string,
  issueDate: Date | string | null,
): Promise<string | null> {
  if (!accessKey || !xmlContent) return null;

  try {
    const segment = buildCompanySegment(companyId);
    if (!segment) {
      log.warn({ companyId }, 'companyId inseguro; XML nao foi salvo em arquivo');
      return null;
    }

    const fileName = buildXmlFileName(accessKey, type);
    if (!fileName) {
      log.warn({ accessKey, type }, 'Chave fiscal insegura; XML nao foi salvo em arquivo');
      return null;
    }

    const monthFolder = getMonthFolder(issueDate);
    const filePath = path.join(XML_BACKUP_DIR, segment, monthFolder, fileName);

    // Já existe (novo ou legado) com tamanho igual/maior: não reescreve.
    for (const candidate of candidatePaths(XML_BACKUP_DIR, companyId, monthFolder, fileName)) {
      try {
        const stats = await fs.stat(candidate);
        if (stats.size >= Buffer.byteLength(xmlContent, 'utf-8')) return candidate;
      } catch {
        // segue
      }
    }

    await writeFileAtomic(filePath, xmlContent);
    return filePath;
  } catch (error) {
    // Non-critical — log but don't throw
    log.error({ err: error, accessKey }, 'Erro ao salvar XML');
    return null;
  }
}

async function savePdfToMonthFolder(
  companyId: string,
  monthFolder: string,
  fileName: string,
  pdfContent: Buffer | Uint8Array,
): Promise<string | null> {
  if (!monthFolder || !fileName || !pdfContent?.byteLength) return null;

  try {
    const segment = buildCompanySegment(companyId);
    if (!segment) {
      log.warn({ companyId }, 'companyId inseguro; PDF nao foi salvo em arquivo');
      return null;
    }
    const filePath = path.join(PDF_BACKUP_DIR, segment, monthFolder, fileName);
    return await writeBufferToFileIfNeeded(filePath, pdfContent);
  } catch (error) {
    log.error({ err: error, fileName }, 'Erro ao salvar PDF');
    return null;
  }
}

export async function saveIssuedPdfToFile(
  companyId: string,
  invoiceNumber: string,
  pdfContent: Buffer | Uint8Array,
  issueDate: Date | string | null,
): Promise<string | null> {
  const fileName = buildIssuedNfePdfFileName(invoiceNumber);
  if (!fileName) return null;
  return savePdfToMonthFolder(companyId, getMonthFolder(issueDate), fileName, pdfContent);
}

export async function readIssuedPdfFromFile(
  companyId: string,
  invoiceNumber: string,
  issueDate: Date | string | null,
): Promise<Buffer | null> {
  const fileName = buildIssuedNfePdfFileName(invoiceNumber);
  if (!fileName) return null;

  for (const candidate of candidatePaths(PDF_BACKUP_DIR, companyId, getMonthFolder(issueDate), fileName)) {
    try {
      return await fs.readFile(candidate);
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

/** Lê XML do filesystem (Phase 11 — fonte preferida quando existir). */
async function readXmlFromFile(
  companyId: string,
  accessKey: string,
  type: string,
  issueDate: Date | string | null,
): Promise<string | null> {
  const fileName = buildXmlFileName(accessKey, type);
  if (!fileName) return null;

  for (const candidate of candidatePaths(XML_BACKUP_DIR, companyId, getMonthFolder(issueDate), fileName)) {
    try {
      return await fs.readFile(candidate, 'utf-8');
    } catch {
      // tenta o próximo candidato
    }
  }
  return null;
}

/**
 * Resolve XML: arquivo em storage primeiro, fallback para coluna Invoice.xmlContent.
 * Não remove xmlContent do banco nesta fase — só prepara o caminho de leitura.
 */
export async function resolveInvoiceXmlContent(invoice: {
  companyId: string;
  accessKey: string;
  type: string;
  issueDate: Date | string | null;
  xmlContent?: string | null;
}): Promise<string | null> {
  const fromFile = await readXmlFromFile(
    invoice.companyId,
    invoice.accessKey,
    invoice.type,
    invoice.issueDate,
  );
  if (fromFile) return fromFile;
  return invoice.xmlContent || null;
}
