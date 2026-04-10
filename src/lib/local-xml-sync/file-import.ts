import { promises as fs } from 'fs';
import path from 'path';

import { parseInvoiceXml } from '../parse-invoice-xml';
import { resolveInvoiceDirection } from '../invoice-direction';
import { extractFirstCfop } from '../cfop';
import { updateProductAggregatesForInvoice } from '../product-aggregate-updater';
import { prisma } from '../prisma';
import { createLogger } from '@/lib/logger';
import type { TargetCompany } from './sync-types';
import { isXmlFile, getErrorCode, chunkArray, extractAccessKeyFromFilePath } from './sync-utils';

const log = createLogger('local-xml-sync:file-import');

const DEFAULT_SINGLE_COMPANY_CNPJ = '07832309000197';
const RECENT_FILE_CACHE_LIMIT = 10_000;
const DB_LOOKUP_CHUNK_SIZE = 500;
const PARSE_RETRY_COOLDOWN_MS = Math.max(2_000, Number(process.env.LOCAL_XML_PARSE_RETRY_MS || 30_000));

const targetCompanyCnpj = (process.env.SINGLE_COMPANY_CNPJ || DEFAULT_SINGLE_COMPANY_CNPJ).replace(/\D/g, '');

let cachedCompany: TargetCompany | null = null;
let lastCompanyLookupAt = 0;
let warnedMissingCompany = false;
let drainingQueue = false;

const importQueue = new Set<string>();
const recentFileFingerprints = new Map<string, string>();
const parseFailureCooldown = new Map<string, { fingerprint: string; retryAtMs: number }>();

export async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const info = await fs.stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

export async function getTargetCompany(): Promise<TargetCompany | null> {
  const now = Date.now();
  if (cachedCompany && now - lastCompanyLookupAt < 60_000) {
    return cachedCompany;
  }

  lastCompanyLookupAt = now;

  const byCnpj = await prisma.company.findUnique({
    where: { cnpj: targetCompanyCnpj },
    select: { id: true, cnpj: true },
  });

  if (byCnpj) {
    cachedCompany = byCnpj;
    warnedMissingCompany = false;
    return cachedCompany;
  }

  const firstCompany = await prisma.company.findFirst({
    orderBy: { createdAt: 'asc' },
    select: { id: true, cnpj: true },
  });

  if (!firstCompany) {
    if (!warnedMissingCompany) {
      warnedMissingCompany = true;
      log.warn('Nenhuma empresa cadastrada ainda; importacao automatica pausada');
    }
    cachedCompany = null;
    return null;
  }

  warnedMissingCompany = false;
  cachedCompany = firstCompany;
  log.warn({ expectedCnpj: targetCompanyCnpj, usedCnpj: firstCompany.cnpj }, 'Empresa nao encontrada; usando primeira empresa');
  return cachedCompany;
}

export async function getNewestMonthFolder(rootDir: string): Promise<string> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length === 0) return rootDir;

  const sortedByName = [...dirs].sort((a, b) => (
    b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
  ));

  return path.join(rootDir, sortedByName[0].name);
}

export async function getMostRecentMonthFolders(rootDir: string, limit: number): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  if (dirs.length === 0) return [rootDir];
  return dirs.slice(0, limit).map((entry) => path.join(rootDir, entry.name));
}

export async function collectAllXmlFiles(currentDir: string, output: string[]): Promise<void> {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });

  for (const entry of entries) {
    const target = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await collectAllXmlFiles(target, output);
      continue;
    }
    if (entry.isFile() && isXmlFile(target)) {
      output.push(target);
    }
  }
}

export async function findFilesMissingInDatabase(filePaths: string[]): Promise<string[]> {
  if (filePaths.length === 0) return [];

  const accessKeyByFile = new Map<string, string>();
  const uniqueKeys: string[] = [];
  const seenKeys = new Set<string>();

  for (const filePath of filePaths) {
    const accessKey = extractAccessKeyFromFilePath(filePath);
    if (!accessKey) continue;
    accessKeyByFile.set(filePath, accessKey);
    if (!seenKeys.has(accessKey)) {
      seenKeys.add(accessKey);
      uniqueKeys.push(accessKey);
    }
  }

  const existingKeysWithXml = new Set<string>();
  const chunks = chunkArray(uniqueKeys, DB_LOOKUP_CHUNK_SIZE);
  for (const chunk of chunks) {
    const rows = await prisma.invoice.findMany({
      where: { accessKey: { in: chunk } },
      select: { accessKey: true, xmlContent: true },
    });
    for (const row of rows) {
      if (row.xmlContent && row.xmlContent !== '') {
        existingKeysWithXml.add(row.accessKey);
      }
    }
  }

  return filePaths.filter((filePath) => {
    const accessKey = accessKeyByFile.get(filePath);
    return !accessKey || !existingKeysWithXml.has(accessKey);
  });
}

export function rememberFileFingerprint(filePath: string, fingerprint: string): void {
  recentFileFingerprints.set(filePath, fingerprint);

  while (recentFileFingerprints.size > RECENT_FILE_CACHE_LIMIT) {
    const oldest = recentFileFingerprints.keys().next().value;
    if (!oldest) break;
    recentFileFingerprints.delete(oldest);
  }
}

export async function copyXmlFileIfNeeded(sourceFilePath: string, targetFilePath: string): Promise<boolean> {
  const sourceStats = await fs.stat(sourceFilePath);
  if (!sourceStats.isFile()) return false;

  let shouldCopy = true;
  try {
    const targetStats = await fs.stat(targetFilePath);
    const sameSize = targetStats.size === sourceStats.size;
    const sourceMtime = Math.floor(sourceStats.mtimeMs);
    const targetMtime = Math.floor(targetStats.mtimeMs);
    if (sameSize && targetMtime >= sourceMtime) {
      shouldCopy = false;
    }
  } catch {
    // Destino ainda nao existe.
  }

  if (!shouldCopy) return false;

  await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
  await fs.copyFile(sourceFilePath, targetFilePath);
  try {
    await fs.utimes(targetFilePath, sourceStats.atime, sourceStats.mtime);
  } catch {
    // Alguns filesystems podem nao permitir ajuste de mtime.
  }
  return true;
}

export async function importXmlFile(filePath: string): Promise<void> {
  if (!isXmlFile(filePath)) return;

  const absolutePath = path.resolve(filePath);

  try {
    const stats = await fs.stat(absolutePath);
    if (!stats.isFile()) return;

    const fingerprint = `${stats.size}:${Math.floor(stats.mtimeMs)}`;
    if (recentFileFingerprints.get(absolutePath) === fingerprint) return;

    const cooldown = parseFailureCooldown.get(absolutePath);
    if (cooldown && cooldown.fingerprint === fingerprint && Date.now() < cooldown.retryAtMs) {
      return;
    }

    const company = await getTargetCompany();
    if (!company) return;

    const xmlContent = await fs.readFile(absolutePath, 'utf-8');
    const parsed = await parseInvoiceXml(xmlContent);
    if (!parsed) {
      parseFailureCooldown.set(absolutePath, {
        fingerprint,
        retryAtMs: Date.now() + PARSE_RETRY_COOLDOWN_MS,
      });
      log.warn({ file: path.basename(absolutePath), retrySeconds: Math.round(PARSE_RETRY_COOLDOWN_MS / 1000) }, 'XML ainda nao parseavel, agendado retry');
      return;
    }

    const normalizedDirection = resolveInvoiceDirection(
      company.cnpj,
      parsed.senderCnpj,
      parsed.accessKey,
    );

    const savedInvoice = await prisma.invoice.create({
      data: {
        companyId: company.id,
        accessKey: parsed.accessKey,
        type: parsed.type,
        direction: normalizedDirection,
        number: parsed.number,
        series: parsed.series,
        issueDate: parsed.issueDate,
        senderCnpj: parsed.senderCnpj,
        senderName: parsed.senderName,
        recipientCnpj: parsed.recipientCnpj,
        recipientName: parsed.recipientName,
        totalValue: parsed.totalValue,
        cfop: extractFirstCfop(xmlContent),
        xmlContent,
      },
    });

    // Incremental aggregate update
    if (parsed.type === 'NFE' && xmlContent) {
      updateProductAggregatesForInvoice({
        companyId: company.id,
        invoiceId: savedInvoice.id,
        xmlContent,
        direction: normalizedDirection,
        issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
        senderName: parsed.senderName,
        senderCnpj: parsed.senderCnpj,
        recipientName: parsed.recipientName,
        recipientCnpj: parsed.recipientCnpj,
        invoiceNumber: parsed.number,
      }).catch((err) => { log.error({ err }, 'updateProductAggregatesForInvoice failed'); });
    }

    rememberFileFingerprint(absolutePath, fingerprint);
    parseFailureCooldown.delete(absolutePath);
    log.info({ file: path.basename(absolutePath), direction: normalizedDirection }, 'Nota importada');
  } catch (error) {
    const code = getErrorCode(error);

    if (code === 'ENOENT') return;
    if (code === 'P2002') {
      try {
        const xmlContent = await fs.readFile(absolutePath, 'utf-8');
        const parsed = await parseInvoiceXml(xmlContent);
        if (parsed?.accessKey) {
          const existing = await prisma.invoice.findFirst({
            where: { accessKey: parsed.accessKey },
            select: { id: true, xmlContent: true, companyId: true },
          });
          if (existing && (!existing.xmlContent || existing.xmlContent === '')) {
            await prisma.invoice.update({
              where: { id: existing.id },
              data: { xmlContent },
            });
            log.info({ file: path.basename(absolutePath) }, 'XML preenchido para nota existente');

            const company = await getTargetCompany();
            if (company && parsed.type === 'NFE') {
              const normalizedDirection = resolveInvoiceDirection(company.cnpj, parsed.senderCnpj, parsed.accessKey);
              updateProductAggregatesForInvoice({
                companyId: company.id,
                invoiceId: existing.id,
                xmlContent,
                direction: normalizedDirection,
                issueDate: parsed.issueDate ? new Date(parsed.issueDate) : null,
                senderName: parsed.senderName,
                senderCnpj: parsed.senderCnpj,
                recipientName: parsed.recipientName,
                recipientCnpj: parsed.recipientCnpj,
                invoiceNumber: parsed.number,
              }).catch((err) => { log.error({ err }, 'updateProductAggregatesForInvoice failed'); });
            }
          }
        }
        const stats = await fs.stat(absolutePath);
        const fingerprint = `${stats.size}:${Math.floor(stats.mtimeMs)}`;
        rememberFileFingerprint(absolutePath, fingerprint);
        parseFailureCooldown.delete(absolutePath);
      } catch (backfillErr) {
        log.error({ err: backfillErr }, 'Failed to backfill xmlContent for existing invoice');
      }
      return;
    }

    log.error({ err: error, file: absolutePath }, 'Falha ao importar XML');
  }
}

export function enqueueImport(filePath: string): void {
  if (!isXmlFile(filePath)) return;
  importQueue.add(path.resolve(filePath));
  void drainImportQueue();
}

export async function drainImportQueue(): Promise<void> {
  if (drainingQueue) return;
  drainingQueue = true;

  try {
    while (importQueue.size > 0) {
      const iterator = importQueue.values().next();
      const nextFile = iterator.value as string | undefined;
      if (!nextFile) break;
      importQueue.delete(nextFile);
      await importXmlFile(nextFile);
    }
  } finally {
    drainingQueue = false;
  }
}
