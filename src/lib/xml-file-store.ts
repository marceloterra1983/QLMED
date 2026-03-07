import { promises as fs } from 'fs';
import path from 'path';

const XML_BACKUP_DIR = process.env.LOCAL_XML_BACKUP_DIR || path.join(process.cwd(), 'xml_backup');

const TYPE_SUFFIX: Record<string, string> = {
  NFE: 'nfe',
  CTE: 'cte',
  NFSE: 'nfse',
};

function getMonthFolder(issueDate: Date | string | null): string {
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
