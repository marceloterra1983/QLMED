import { type OneDriveConnection } from '@prisma/client';
import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import type { Stats } from 'fs';
import path from 'path';

import { decrypt, encrypt } from './crypto';
import { refreshOneDriveAccessToken } from './onedrive-client';
import { parseInvoiceXml } from './parse-invoice-xml';
import { resolveInvoiceDirection } from './invoice-direction';
import { updateProductAggregatesForInvoice } from './product-aggregate-updater';
import { prisma } from './prisma';

const DEFAULT_SINGLE_COMPANY_CNPJ = '07832309000197';
const DEFAULT_LOCAL_XML_DIR = path.join(process.cwd(), 'xml_backup');
const WATCH_STABILITY_MS = Math.max(500, Number(process.env.LOCAL_XML_WATCH_STABILITY_MS || 1500));
const RESCAN_INTERVAL_MS = Math.max(5_000, Number(process.env.LOCAL_XML_RESCAN_INTERVAL_MS || 10_000));
const BOOTSTRAP_RETRY_INTERVAL_MS = Math.max(5_000, Number(process.env.LOCAL_XML_BOOTSTRAP_RETRY_MS || 10_000));
const RECENT_FILE_CACHE_LIMIT = 10_000;
const DB_LOOKUP_CHUNK_SIZE = 500;
const PARSE_RETRY_COOLDOWN_MS = Math.max(2_000, Number(process.env.LOCAL_XML_PARSE_RETRY_MS || 30_000));
const FORCED_SYNC_MIN_INTERVAL_MS = Math.max(2_000, Number(process.env.LOCAL_XML_FORCED_MIN_INTERVAL_MS || 5_000));
const HALF_HOUR_MS = 30 * 60 * 1000;
const FULL_RECONCILE_ENABLED = (process.env.LOCAL_XML_FULL_RECONCILE_ENABLED || 'true').toLowerCase() === 'true';
const FULL_RECONCILE_MONTH_FOLDERS = Math.max(1, Number(process.env.LOCAL_XML_FULL_RECONCILE_MONTH_FOLDERS || 2));
const LOCAL_COPY_REQUESTED = (process.env.LOCAL_XML_COPY_ENABLED || 'false').toLowerCase() === 'true';
const COPY_FROM_SOURCE_INTERVAL_MS = Math.max(15_000, Number(process.env.LOCAL_XML_COPY_INTERVAL_MS || 60_000));
const COPY_FROM_SOURCE_MONTH_FOLDERS = Math.max(1, Number(process.env.LOCAL_XML_COPY_MONTH_FOLDERS || 2));
const COPY_FROM_ONEDRIVE_ENABLED = (process.env.LOCAL_XML_COPY_ONEDRIVE_ENABLED || 'true').toLowerCase() === 'true';
const ONEDRIVE_XML_ROOT_PATH = (process.env.LOCAL_XML_ONEDRIVE_XML_PATH || '/BACKUP_QL MED/NFE/XML').trim();
const ONEDRIVE_PDF_ROOT_PATH = (process.env.LOCAL_XML_ONEDRIVE_PDF_PATH || '/BACKUP_QL MED/NFE/Danfes').trim();
const ONEDRIVE_MONTH_FOLDERS = Math.max(
  1,
  Number(process.env.LOCAL_XML_ONEDRIVE_MONTH_FOLDERS || COPY_FROM_SOURCE_MONTH_FOLDERS),
);
const ONEDRIVE_TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000;

const rawRootDir = (process.env.LOCAL_XML_WATCH_DIR || DEFAULT_LOCAL_XML_DIR).trim();
const rawFallbackDir = (process.env.LOCAL_XML_WATCH_FALLBACK_DIR || DEFAULT_LOCAL_XML_DIR).trim();
const rawCopySourceDir = (process.env.LOCAL_XML_COPY_SOURCE_DIR || '').trim();
const rawCopyTargetDir = (process.env.LOCAL_XML_COPY_TARGET_DIR || rawFallbackDir).trim();
const rawPdfTargetDir = (
  process.env.LOCAL_PDF_BACKUP_DIR || path.join(path.dirname(resolveConfiguredDir(rawCopyTargetDir)), 'pdf_backup')
).trim();
const localXmlWatchEnabled = (process.env.LOCAL_XML_WATCH_ENABLED || 'true').toLowerCase() === 'true';
const targetCompanyCnpj = (process.env.SINGLE_COMPANY_CNPJ || DEFAULT_SINGLE_COMPANY_CNPJ).replace(/\D/g, '');
const COPY_FROM_SOURCE_ENABLED = LOCAL_COPY_REQUESTED && rawCopySourceDir.length > 0;

if (LOCAL_COPY_REQUESTED && !COPY_FROM_SOURCE_ENABLED) {
  console.warn(
    '[LocalXmlSync] LOCAL_XML_COPY_ENABLED=true, mas LOCAL_XML_COPY_SOURCE_DIR não foi configurado; ignorando cópia local.',
  );
}

let started = false;
let watchRootDir: string | null = null;
let rootWatcher: FSWatcher | null = null;
let latestWatcher: FSWatcher | null = null;
let latestFolder: string | null = null;
let rescanTimer: NodeJS.Timeout | null = null;
let bootstrapTimer: NodeJS.Timeout | null = null;
let copyFromSourceTimer: NodeJS.Timeout | null = null;
let fullReconcileKickoffTimer: NodeJS.Timeout | null = null;
let fullReconcileIntervalTimer: NodeJS.Timeout | null = null;
let warnedMissingRoot = false;
let warnedMissingCopySource = false;
let warnedMissingOneDriveConnection = false;
let warnedMissingOneDrivePath = false;
let warnedMissingOneDrivePdfPath = false;
let drainingQueue = false;
let copyingFromSource = false;
let fullReconcileRunning = false;
let forcedSyncPromise: Promise<void> | null = null;
let lastForcedSyncAt = 0;

const importQueue = new Set<string>();
const recentFileFingerprints = new Map<string, string>();
const parseFailureCooldown = new Map<string, { fingerprint: string; retryAtMs: number }>();

type TargetCompany = {
  id: string;
  cnpj: string;
};

let cachedCompany: TargetCompany | null = null;
let lastCompanyLookupAt = 0;
let warnedMissingCompany = false;

function resolveConfiguredDir(input: string): string {
  const windowsPath = input.match(/^([a-zA-Z]):[\\/](.*)$/);
  if (windowsPath && process.platform !== 'win32') {
    const drive = windowsPath[1].toLowerCase();
    const rest = windowsPath[2].replace(/\\/g, '/');
    return path.posix.normalize(`/mnt/${drive}/${rest}`);
  }

  return path.resolve(input);
}

const watchRootCandidates = Array.from(
  new Set([resolveConfiguredDir(rawRootDir), resolveConfiguredDir(rawFallbackDir)].filter(Boolean)),
);
const copySourceCandidates = rawCopySourceDir
  ? Array.from(new Set([resolveConfiguredDir(rawCopySourceDir)].filter(Boolean)))
  : [];
const copyTargetDir = resolveConfiguredDir(rawCopyTargetDir);
const pdfTargetDir = resolveConfiguredDir(rawPdfTargetDir);

function isXmlFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.xml');
}

function isPdfFile(filePath: string): boolean {
  return filePath.toLowerCase().endsWith('.pdf');
}

function shouldIgnoreByPath(targetPath: string, stats?: Stats): boolean {
  if (stats?.isDirectory()) return false;
  return !isXmlFile(targetPath);
}

function getErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  if (!('code' in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : undefined;
}

function chunkArray<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getDelayUntilNextHalfHourMs(nowDate = new Date()): number {
  const next = new Date(nowDate.getTime());

  if (nowDate.getMinutes() < 30) {
    next.setMinutes(30, 0, 0);
  } else {
    next.setHours(next.getHours() + 1, 0, 0, 0);
  }

  return Math.max(0, next.getTime() - nowDate.getTime());
}

function extractAccessKeyFromFilePath(filePath: string): string | null {
  const fileName = path.basename(filePath);
  const match = fileName.match(/(\d{44})/);
  return match?.[1] || null;
}

type OneDriveItemEntry = {
  id: string;
  name: string;
  size?: number;
  lastModifiedDateTime?: string;
  folder?: {
    childCount?: number;
  };
  file?: {
    mimeType?: string;
  };
};

type OneDriveChildrenResponse = {
  value?: OneDriveItemEntry[];
  '@odata.nextLink'?: string;
};

function normalizeOneDrivePath(rawPath: string): string {
  const trimmed = rawPath.trim().replace(/\\/g, '/');
  if (!trimmed) return '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

async function ensureValidOneDriveAccessTokenLocal(connection: OneDriveConnection): Promise<string> {
  const expiresSoon = connection.tokenExpiresAt.getTime() <= Date.now() + ONEDRIVE_TOKEN_REFRESH_WINDOW_MS;
  const currentAccessToken = decrypt(connection.accessToken);

  if (!expiresSoon) {
    return currentAccessToken;
  }

  const currentRefreshToken = connection.refreshToken ? decrypt(connection.refreshToken) : null;
  if (!currentRefreshToken) {
    throw new Error('Token OneDrive expirado sem refresh token. Reconecte a conta.');
  }

  const refreshed = await refreshOneDriveAccessToken(currentRefreshToken);
  const nextRefreshToken = refreshed.refresh_token || currentRefreshToken;
  const nextExpiresAt = new Date(Date.now() + Math.max(refreshed.expires_in - 60, 1) * 1000);

  await prisma.oneDriveConnection.update({
    where: { id: connection.id },
    data: {
      accessToken: encrypt(refreshed.access_token),
      refreshToken: encrypt(nextRefreshToken),
      tokenExpiresAt: nextExpiresAt,
      scope: refreshed.scope || connection.scope,
    },
  });

  return refreshed.access_token;
}

async function oneDriveGraphJsonRequest<T>(accessToken: string, resourcePath: string): Promise<T> {
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

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = payload && typeof payload === 'object'
      ? JSON.stringify(payload).slice(0, 300)
      : `${response.status} ${response.statusText}`;
    throw new Error(`Falha na API do OneDrive: ${detail}`);
  }

  return payload as T;
}

async function oneDriveGraphDownloadFile(accessToken: string, resourcePath: string): Promise<Buffer> {
  const endpoint = resourcePath.startsWith('http')
    ? resourcePath
    : `https://graph.microsoft.com/v1.0${resourcePath}`;

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => `${response.status} ${response.statusText}`);
    throw new Error(`Falha ao baixar arquivo do OneDrive: ${detail.slice(0, 300)}`);
  }

  const data = await response.arrayBuffer();
  return Buffer.from(data);
}

async function listOneDriveChildrenAll(
  accessToken: string,
  driveId: string,
  itemId: string,
): Promise<OneDriveItemEntry[]> {
  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(itemId);
  const select = '$select=id,name,size,lastModifiedDateTime,folder,file';
  let nextPath: string | null = `/drives/${encodedDriveId}/items/${encodedItemId}/children?$top=200&${select}`;
  const all: OneDriveItemEntry[] = [];

  while (nextPath) {
    const response: OneDriveChildrenResponse = await oneDriveGraphJsonRequest<OneDriveChildrenResponse>(
      accessToken,
      nextPath,
    );
    const chunk = Array.isArray(response.value) ? response.value : [];
    all.push(...chunk);
    nextPath = typeof response['@odata.nextLink'] === 'string' ? response['@odata.nextLink'] : null;
  }

  return all;
}

async function resolveOneDriveItemByPath(
  accessToken: string,
  driveId: string,
  itemPath: string,
): Promise<OneDriveItemEntry> {
  const encodedDriveId = encodeURIComponent(driveId);
  const normalizedPath = normalizeOneDrivePath(itemPath);
  return oneDriveGraphJsonRequest<OneDriveItemEntry>(
    accessToken,
    `/drives/${encodedDriveId}/root:${encodeURI(normalizedPath)}?$select=id,name,size,lastModifiedDateTime,folder,file`,
  );
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    const info = await fs.stat(dirPath);
    return info.isDirectory();
  } catch {
    return false;
  }
}

async function getTargetCompany(): Promise<TargetCompany | null> {
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
      console.warn('[LocalXmlSync] Nenhuma empresa cadastrada ainda; importacao automatica pausada.');
    }
    cachedCompany = null;
    return null;
  }

  warnedMissingCompany = false;
  cachedCompany = firstCompany;
  console.warn(`[LocalXmlSync] Empresa ${targetCompanyCnpj} nao encontrada; usando empresa ${firstCompany.cnpj}.`);
  return cachedCompany;
}

async function getNewestMonthFolder(rootDir: string): Promise<string> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const dirs = entries.filter((entry) => entry.isDirectory());
  if (dirs.length === 0) return rootDir;

  const sortedByName = [...dirs].sort((a, b) => (
    b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' })
  ));

  return path.join(rootDir, sortedByName[0].name);
}

async function getMostRecentMonthFolders(rootDir: string, limit: number): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const dirs = entries
    .filter((entry) => entry.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' }));

  if (dirs.length === 0) return [rootDir];
  return dirs.slice(0, limit).map((entry) => path.join(rootDir, entry.name));
}

async function collectAllXmlFiles(currentDir: string, output: string[]): Promise<void> {
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

async function findFilesMissingInDatabase(filePaths: string[]): Promise<string[]> {
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

function rememberFileFingerprint(filePath: string, fingerprint: string): void {
  recentFileFingerprints.set(filePath, fingerprint);

  while (recentFileFingerprints.size > RECENT_FILE_CACHE_LIMIT) {
    const oldest = recentFileFingerprints.keys().next().value;
    if (!oldest) break;
    recentFileFingerprints.delete(oldest);
  }
}

async function copyXmlFileIfNeeded(sourceFilePath: string, targetFilePath: string): Promise<boolean> {
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

async function copyOneDriveFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!oneDriveItem.file) return false;

  const remoteSize = typeof oneDriveItem.size === 'number' ? oneDriveItem.size : null;
  const remoteMtimeMs = oneDriveItem.lastModifiedDateTime
    ? Date.parse(oneDriveItem.lastModifiedDateTime)
    : Number.NaN;

  let shouldDownload = true;
  try {
    const targetStats = await fs.stat(targetFilePath);
    const sameSize = remoteSize !== null ? targetStats.size === remoteSize : false;
    const targetMtimeMs = Math.floor(targetStats.mtimeMs);
    const remoteMtimeRounded = Number.isFinite(remoteMtimeMs) ? Math.floor(remoteMtimeMs) : null;
    if (sameSize && (remoteMtimeRounded === null || targetMtimeMs >= remoteMtimeRounded)) {
      shouldDownload = false;
    }
  } catch {
    // Destino ainda nao existe.
  }

  if (!shouldDownload) return false;

  const encodedDriveId = encodeURIComponent(driveId);
  const encodedItemId = encodeURIComponent(oneDriveItem.id);
  const buffer = await oneDriveGraphDownloadFile(
    accessToken,
    `/drives/${encodedDriveId}/items/${encodedItemId}/content`,
  );

  await fs.mkdir(path.dirname(targetFilePath), { recursive: true });
  await fs.writeFile(targetFilePath, buffer);

  if (Number.isFinite(remoteMtimeMs)) {
    const mtime = new Date(remoteMtimeMs);
    try {
      await fs.utimes(targetFilePath, mtime, mtime);
    } catch {
      // Alguns filesystems podem nao permitir ajuste de mtime.
    }
  }

  return true;
}

async function copyOneDriveXmlFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!isXmlFile(oneDriveItem.name || '')) return false;
  return copyOneDriveFileIfNeeded(accessToken, driveId, oneDriveItem, targetFilePath);
}

async function copyOneDrivePdfFileIfNeeded(
  accessToken: string,
  driveId: string,
  oneDriveItem: OneDriveItemEntry,
  targetFilePath: string,
): Promise<boolean> {
  if (!isPdfFile(oneDriveItem.name || '')) return false;
  return copyOneDriveFileIfNeeded(accessToken, driveId, oneDriveItem, targetFilePath);
}

async function importXmlFile(filePath: string): Promise<void> {
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
      console.warn(`[LocalXmlSync] XML ainda não parseável, novo retry em ${Math.round(PARSE_RETRY_COOLDOWN_MS / 1000)}s: ${path.basename(absolutePath)}`);
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
      }).catch((err) => { console.error('[LocalXmlSync] updateProductAggregatesForInvoice failed:', (err as Error).message); });
    }

    rememberFileFingerprint(absolutePath, fingerprint);
    parseFailureCooldown.delete(absolutePath);
    console.log(`[LocalXmlSync] Nota importada: ${path.basename(absolutePath)} (${normalizedDirection}).`);
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
            console.log(`[LocalXmlSync] XML preenchido para nota existente: ${path.basename(absolutePath)}`);

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
              }).catch((err) => { console.error('[LocalXmlSync] updateProductAggregatesForInvoice failed:', (err as Error).message); });
            }
          }
        }
        const stats = await fs.stat(absolutePath);
        const fingerprint = `${stats.size}:${Math.floor(stats.mtimeMs)}`;
        rememberFileFingerprint(absolutePath, fingerprint);
        parseFailureCooldown.delete(absolutePath);
      } catch (backfillErr) {
        console.error('[LocalXmlSync] Failed to backfill xmlContent for existing invoice:', (backfillErr as Error).message);
      }
      return;
    }

    console.error(`[LocalXmlSync] Falha ao importar ${absolutePath}:`, error);
  }
}

function enqueueImport(filePath: string): void {
  if (!isXmlFile(filePath)) return;
  importQueue.add(path.resolve(filePath));
  void drainImportQueue();
}

async function drainImportQueue(): Promise<void> {
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

async function reconcileLatestFolder(folderPath: string): Promise<void> {
  const company = await getTargetCompany();
  if (!company) return;

  await reconcileFolder(folderPath, 'Reconciliação');
}

async function reconcileFolder(folderPath: string, logPrefix: string): Promise<number> {
  const xmlFiles: string[] = [];
  try {
    await collectAllXmlFiles(folderPath, xmlFiles);
  } catch (error) {
    console.error(`[LocalXmlSync] Erro ao varrer pasta ${folderPath}:`, error);
    return 0;
  }

  if (xmlFiles.length === 0) return 0;

  const missingFiles = await findFilesMissingInDatabase(xmlFiles);
  if (missingFiles.length === 0) return 0;

  console.log(`[LocalXmlSync] ${logPrefix}: ${missingFiles.length} XML(s) pendente(s) em ${folderPath}.`);
  for (const filePath of missingFiles) {
    enqueueImport(filePath);
  }

  return missingFiles.length;
}

async function runCopyFromOneDrive(trigger: 'startup' | 'interval' | 'manual'): Promise<void> {
  if (!COPY_FROM_ONEDRIVE_ENABLED) return;

  const company = await getTargetCompany();
  if (!company) return;

  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId: company.id },
    orderBy: { updatedAt: 'desc' },
  });

  if (!connection) {
    if (!warnedMissingOneDriveConnection) {
      warnedMissingOneDriveConnection = true;
      console.warn('[LocalXmlSync] OneDrive sem conexão ativa para sincronizar XML.');
    }
    return;
  }
  warnedMissingOneDriveConnection = false;

  const accessToken = await ensureValidOneDriveAccessTokenLocal(connection);
  let xmlRootItem: OneDriveItemEntry;
  try {
    xmlRootItem = await resolveOneDriveItemByPath(accessToken, connection.driveId, ONEDRIVE_XML_ROOT_PATH);
  } catch (error) {
    if (!warnedMissingOneDrivePath) {
      warnedMissingOneDrivePath = true;
      console.warn(
        `[LocalXmlSync] Pasta OneDrive de XML não encontrada (${ONEDRIVE_XML_ROOT_PATH}).`,
      );
    }
    return;
  }
  warnedMissingOneDrivePath = false;

  if (!xmlRootItem.folder) return;

  await fs.mkdir(copyTargetDir, { recursive: true });
  await fs.mkdir(pdfTargetDir, { recursive: true });

  const xmlRootChildren = await listOneDriveChildrenAll(accessToken, connection.driveId, xmlRootItem.id);
  const xmlMonthFolders = xmlRootChildren
    .filter((entry) => entry.folder)
    .sort((a, b) => b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
    .slice(0, ONEDRIVE_MONTH_FOLDERS);

  let copiedXmlCount = 0;
  for (const monthFolder of xmlMonthFolders) {
    const children = await listOneDriveChildrenAll(accessToken, connection.driveId, monthFolder.id);
    const xmlFiles = children.filter((entry) => entry.file && isXmlFile(entry.name || ''));

    for (const oneDriveFile of xmlFiles) {
      const targetFilePath = path.join(copyTargetDir, monthFolder.name, oneDriveFile.name);
      const copied = await copyOneDriveXmlFileIfNeeded(accessToken, connection.driveId, oneDriveFile, targetFilePath);
      if (!copied) continue;

      copiedXmlCount += 1;
      enqueueImport(targetFilePath);
    }
  }

  let copiedPdfCount = 0;
  try {
    const pdfRootItem = await resolveOneDriveItemByPath(accessToken, connection.driveId, ONEDRIVE_PDF_ROOT_PATH);

    if (pdfRootItem.folder) {
      warnedMissingOneDrivePdfPath = false;
      const pdfRootChildren = await listOneDriveChildrenAll(accessToken, connection.driveId, pdfRootItem.id);
      const pdfMonthFolders = pdfRootChildren
        .filter((entry) => entry.folder)
        .sort((a, b) => b.name.localeCompare(a.name, 'pt-BR', { numeric: true, sensitivity: 'base' }))
        .slice(0, ONEDRIVE_MONTH_FOLDERS);

      for (const monthFolder of pdfMonthFolders) {
        const children = await listOneDriveChildrenAll(accessToken, connection.driveId, monthFolder.id);
        const pdfFiles = children.filter((entry) => entry.file && isPdfFile(entry.name || ''));

        for (const oneDriveFile of pdfFiles) {
          const targetFilePath = path.join(pdfTargetDir, monthFolder.name, oneDriveFile.name);
          const copied = await copyOneDrivePdfFileIfNeeded(accessToken, connection.driveId, oneDriveFile, targetFilePath);
          if (copied) {
            copiedPdfCount += 1;
          }
        }
      }
    }
  } catch (error) {
    if (!warnedMissingOneDrivePdfPath) {
      warnedMissingOneDrivePdfPath = true;
      console.warn(
        `[LocalXmlSync] Pasta OneDrive de PDF não encontrada (${ONEDRIVE_PDF_ROOT_PATH}).`,
      );
    }
  }

  if (copiedXmlCount > 0 || copiedPdfCount > 0) {
    const triggerLabel = trigger === 'interval' ? 'periodica' : trigger === 'startup' ? 'inicial' : 'manual';
    console.log(
      `[LocalXmlSync] Copia OneDrive ${triggerLabel}: ${copiedXmlCount} XML(s) em ${copyTargetDir} e ${copiedPdfCount} PDF(s) em ${pdfTargetDir}.`,
    );
    if (copiedXmlCount > 0) {
      await drainImportQueue();
    }
  }
}

async function runCopyFromSource(trigger: 'startup' | 'interval' | 'manual'): Promise<void> {
  if (!COPY_FROM_SOURCE_ENABLED) {
    await runCopyFromOneDrive(trigger);
    return;
  }
  if (copyingFromSource) return;

  copyingFromSource = true;

  try {
    const sourceRoot = await selectExistingCopySourceRoot();
    if (!sourceRoot) {
      if (!warnedMissingCopySource) {
        warnedMissingCopySource = true;
        console.warn(
          `[LocalXmlSync] Copia automatica ativa, mas pasta de origem nao encontrada. Candidatas: ${copySourceCandidates.join(' | ')}`,
        );
      }
      await runCopyFromOneDrive(trigger);
      return;
    }
    warnedMissingCopySource = false;

    await fs.mkdir(copyTargetDir, { recursive: true });

    const sourceFolders = await getMostRecentMonthFolders(sourceRoot, COPY_FROM_SOURCE_MONTH_FOLDERS);
    let copiedCount = 0;

    for (const sourceFolderPath of sourceFolders) {
      const sourceFiles: string[] = [];
      await collectAllXmlFiles(sourceFolderPath, sourceFiles);

      for (const sourceFilePath of sourceFiles) {
        const relativePath = path.relative(sourceRoot, sourceFilePath);
        const targetFilePath = path.join(copyTargetDir, relativePath);
        const copied = await copyXmlFileIfNeeded(sourceFilePath, targetFilePath);
        if (!copied) continue;

        copiedCount += 1;
        enqueueImport(targetFilePath);
      }
    }

    if (copiedCount > 0) {
      const triggerLabel = trigger === 'interval' ? 'periodica' : trigger === 'startup' ? 'inicial' : 'manual';
      console.log(
        `[LocalXmlSync] Copia ${triggerLabel}: ${copiedCount} XML(s) atualizado(s) de ${sourceRoot} para ${copyTargetDir}.`,
      );
      await drainImportQueue();
    }
  } catch (error) {
    console.error('[LocalXmlSync] Falha na copia automatica de XML:', error);
  } finally {
    copyingFromSource = false;
  }
}

async function runFullReconciliation(trigger: 'startup' | 'scheduled' | 'manual'): Promise<void> {
  if (fullReconcileRunning) {
    return;
  }

  fullReconcileRunning = true;

  try {
    const company = await getTargetCompany();
    if (!company) return;

    const selectedRoot = await selectExistingWatchRoot();
    if (!selectedRoot) return;

    const foldersToReconcile = await getMostRecentMonthFolders(selectedRoot, FULL_RECONCILE_MONTH_FOLDERS);
    let pendingCount = 0;
    for (const folderPath of foldersToReconcile) {
      pendingCount += await reconcileFolder(folderPath, 'Reconciliação completa');
    }
    await drainImportQueue();

    const tag = trigger === 'scheduled' ? 'agendada' : trigger === 'startup' ? 'inicial' : 'manual';
    console.log(
      `[LocalXmlSync] Reconciliação completa ${tag} concluída (pastas: ${foldersToReconcile.length}). Pendências tratadas: ${pendingCount}.`,
    );
  } catch (error) {
    console.error('[LocalXmlSync] Falha na reconciliação completa:', error);
  } finally {
    fullReconcileRunning = false;
  }
}

function scheduleHalfHourFullReconciliation(): void {
  if (!FULL_RECONCILE_ENABLED) return;

  if (fullReconcileKickoffTimer) {
    clearTimeout(fullReconcileKickoffTimer);
    fullReconcileKickoffTimer = null;
  }

  if (fullReconcileIntervalTimer) {
    clearInterval(fullReconcileIntervalTimer);
    fullReconcileIntervalTimer = null;
  }

  const now = new Date();
  const delay = getDelayUntilNextHalfHourMs(now);
  const nextRunAt = new Date(now.getTime() + delay);

  console.log(
    `[LocalXmlSync] Reconciliação completa agendada para ${nextRunAt.toLocaleString('pt-BR', { hour12: false })} e repetirá a cada 30 minutos (hh:00/hh:30).`,
  );

  fullReconcileKickoffTimer = setTimeout(() => {
    void runFullReconciliation('scheduled');

    fullReconcileIntervalTimer = setInterval(() => {
      void runFullReconciliation('scheduled');
    }, HALF_HOUR_MS);
  }, delay);
}

async function closeActiveWatchers(): Promise<void> {
  if (latestWatcher) {
    await latestWatcher.close();
    latestWatcher = null;
  }

  if (rootWatcher) {
    await rootWatcher.close();
    rootWatcher = null;
  }

  latestFolder = null;
}

async function selectExistingWatchRoot(): Promise<string | null> {
  for (const candidate of watchRootCandidates) {
    if (await directoryExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function selectExistingCopySourceRoot(): Promise<string | null> {
  for (const candidate of copySourceCandidates) {
    if (await directoryExists(candidate)) {
      return candidate;
    }
  }
  return null;
}

async function openLatestFolderWatcher(forceReconcile = false): Promise<void> {
  if (!watchRootDir) return;

  let nextLatest: string;
  try {
    nextLatest = await getNewestMonthFolder(watchRootDir);
  } catch (error) {
    console.error(`[LocalXmlSync] Nao foi possivel identificar pasta mais recente em ${watchRootDir}:`, error);
    return;
  }

  if (latestFolder === nextLatest && latestWatcher) {
    if (forceReconcile) {
      await reconcileLatestFolder(nextLatest);
    }
    return;
  }

  if (latestWatcher) {
    await latestWatcher.close();
    latestWatcher = null;
  }

  latestFolder = nextLatest;
  latestWatcher = chokidar.watch(nextLatest, {
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: {
      stabilityThreshold: WATCH_STABILITY_MS,
      pollInterval: 100,
    },
    ignored: shouldIgnoreByPath,
  });

  latestWatcher.on('add', (targetPath) => enqueueImport(targetPath));
  latestWatcher.on('change', (targetPath) => enqueueImport(targetPath));
  latestWatcher.on('error', (error) => {
    console.error('[LocalXmlSync] Erro no watcher da pasta atual:', error);
  });

  console.log(`[LocalXmlSync] Monitorando pasta ativa: ${nextLatest}`);
  await reconcileLatestFolder(nextLatest);
}

async function startWatchers(forceReconcile = true): Promise<void> {
  const selectedRoot = await selectExistingWatchRoot();

  if (!selectedRoot) {
    if (!warnedMissingRoot) {
      warnedMissingRoot = true;
      console.warn(
        `[LocalXmlSync] Nenhuma pasta de XML encontrada. Candidatas: ${watchRootCandidates.join(' | ')}`,
      );
    }
    watchRootDir = null;
    await closeActiveWatchers();
    return;
  }

  warnedMissingRoot = false;

  const rootChanged = watchRootDir !== selectedRoot;
  if (rootChanged) {
    watchRootDir = selectedRoot;
    await closeActiveWatchers();
    console.log(`[LocalXmlSync] Pasta raiz ativa: ${watchRootDir}`);
  }

  if (!rootWatcher && watchRootDir) {
    rootWatcher = chokidar.watch(watchRootDir, {
      ignoreInitial: true,
      persistent: true,
      depth: 1,
    });

    rootWatcher.on('addDir', () => {
      void openLatestFolderWatcher(true);
    });
    rootWatcher.on('unlinkDir', () => {
      void openLatestFolderWatcher(true);
    });
    rootWatcher.on('error', (error) => {
      console.error('[LocalXmlSync] Erro no watcher raiz:', error);
    });

    console.log(`[LocalXmlSync] Watcher raiz iniciado em ${watchRootDir}`);
  }

  await openLatestFolderWatcher(forceReconcile);

  if (bootstrapTimer) {
    clearInterval(bootstrapTimer);
    bootstrapTimer = null;
  }
}

export function startLocalXmlSync(): void {
  if (started) return;
  started = true;

  // OneDrive/source copy runs independently of local filesystem watching,
  // so emitted invoices sync even when LOCAL_XML_WATCH_ENABLED=false (production).
  if (COPY_FROM_SOURCE_ENABLED || COPY_FROM_ONEDRIVE_ENABLED) {
    console.log('[LocalXmlSync] Inicializando sync de XML via OneDrive/source copy.');
    void runCopyFromSource('startup');

    if (!copyFromSourceTimer) {
      copyFromSourceTimer = setInterval(() => {
        void runCopyFromSource('interval');
      }, COPY_FROM_SOURCE_INTERVAL_MS);
    }
  }

  if (!localXmlWatchEnabled) {
    console.log('[LocalXmlSync] Monitoramento local de filesystem desativado via LOCAL_XML_WATCH_ENABLED.');
    return;
  }

  console.log('[LocalXmlSync] Inicializando monitoramento local de XML.');

  void startWatchers(true);

  if (!rescanTimer) {
    rescanTimer = setInterval(() => {
      void startWatchers(true);
    }, RESCAN_INTERVAL_MS);
  }

  if (!bootstrapTimer) {
    bootstrapTimer = setInterval(() => {
      void startWatchers(true);
    }, BOOTSTRAP_RETRY_INTERVAL_MS);
  }

  if (FULL_RECONCILE_ENABLED) {
    scheduleHalfHourFullReconciliation();
    void runFullReconciliation('startup');
  }
}

export async function ensureLocalXmlSyncNow(): Promise<void> {
  const hasCopySource = COPY_FROM_SOURCE_ENABLED || COPY_FROM_ONEDRIVE_ENABLED;
  if (!localXmlWatchEnabled && !hasCopySource) return;

  const now = Date.now();

  if (forcedSyncPromise) {
    await forcedSyncPromise;
    return;
  }

  if (now - lastForcedSyncAt < FORCED_SYNC_MIN_INTERVAL_MS) {
    return;
  }

  forcedSyncPromise = (async () => {
    try {
      if (hasCopySource) {
        await runCopyFromSource('manual');
      }
      if (localXmlWatchEnabled) {
        await startWatchers(true);
      }
      await drainImportQueue();
      lastForcedSyncAt = Date.now();
    } finally {
      forcedSyncPromise = null;
    }
  })();

  await forcedSyncPromise;
}
