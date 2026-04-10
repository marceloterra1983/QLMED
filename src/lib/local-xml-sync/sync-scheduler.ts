import chokidar, { FSWatcher } from 'chokidar';
import { promises as fs } from 'fs';
import path from 'path';

import { prisma } from '../prisma';
import { createLogger } from '@/lib/logger';
import type { OneDriveItemEntry } from './sync-types';
import { resolveConfiguredDir, isXmlFile, isPdfFile, shouldIgnoreByPath, getDelayUntilNextHalfHourMs } from './sync-utils';
import {
  ensureValidOneDriveAccessTokenLocal,
  listOneDriveChildrenAll,
  resolveOneDriveItemByPath,
  copyOneDriveXmlFileIfNeeded,
  copyOneDrivePdfFileIfNeeded,
} from './onedrive-client';
import {
  directoryExists,
  getTargetCompany,
  getNewestMonthFolder,
  getMostRecentMonthFolders,
  collectAllXmlFiles,
  findFilesMissingInDatabase,
  copyXmlFileIfNeeded,
  enqueueImport,
  drainImportQueue,
} from './file-import';

const log = createLogger('local-xml-sync:scheduler');

const DEFAULT_LOCAL_XML_DIR = path.join(process.cwd(), 'xml_backup');
const WATCH_STABILITY_MS = Math.max(500, Number(process.env.LOCAL_XML_WATCH_STABILITY_MS || 1500));
const RESCAN_INTERVAL_MS = Math.max(5_000, Number(process.env.LOCAL_XML_RESCAN_INTERVAL_MS || 10_000));
const BOOTSTRAP_RETRY_INTERVAL_MS = Math.max(5_000, Number(process.env.LOCAL_XML_BOOTSTRAP_RETRY_MS || 10_000));
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

const rawRootDir = (process.env.LOCAL_XML_WATCH_DIR || DEFAULT_LOCAL_XML_DIR).trim();
const rawFallbackDir = (process.env.LOCAL_XML_WATCH_FALLBACK_DIR || DEFAULT_LOCAL_XML_DIR).trim();
const rawCopySourceDir = (process.env.LOCAL_XML_COPY_SOURCE_DIR || '').trim();
const rawCopyTargetDir = (process.env.LOCAL_XML_COPY_TARGET_DIR || rawFallbackDir).trim();
const rawPdfTargetDir = (
  process.env.LOCAL_PDF_BACKUP_DIR || path.join(path.dirname(resolveConfiguredDir(rawCopyTargetDir)), 'pdf_backup')
).trim();
const localXmlWatchEnabled = (process.env.LOCAL_XML_WATCH_ENABLED || 'true').toLowerCase() === 'true';
const COPY_FROM_SOURCE_ENABLED = LOCAL_COPY_REQUESTED && rawCopySourceDir.length > 0;

if (LOCAL_COPY_REQUESTED && !COPY_FROM_SOURCE_ENABLED) {
  log.warn('LOCAL_XML_COPY_ENABLED=true, mas LOCAL_XML_COPY_SOURCE_DIR nao foi configurado; ignorando copia local');
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
let copyingFromSource = false;
let fullReconcileRunning = false;
let forcedSyncPromise: Promise<void> | null = null;
let lastForcedSyncAt = 0;

const watchRootCandidates = Array.from(
  new Set([resolveConfiguredDir(rawRootDir), resolveConfiguredDir(rawFallbackDir)].filter(Boolean)),
);
const copySourceCandidates = rawCopySourceDir
  ? Array.from(new Set([resolveConfiguredDir(rawCopySourceDir)].filter(Boolean)))
  : [];
const copyTargetDir = resolveConfiguredDir(rawCopyTargetDir);
const pdfTargetDir = resolveConfiguredDir(rawPdfTargetDir);

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
    log.error({ err: error, folder: folderPath }, 'Erro ao varrer pasta');
    return 0;
  }

  if (xmlFiles.length === 0) return 0;

  const missingFiles = await findFilesMissingInDatabase(xmlFiles);
  if (missingFiles.length === 0) return 0;

  log.info({ prefix: logPrefix, pendingCount: missingFiles.length, folder: folderPath }, 'XMLs pendentes encontrados');
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
      log.warn('OneDrive sem conexao ativa para sincronizar XML');
    }
    return;
  }
  warnedMissingOneDriveConnection = false;

  const accessToken = await ensureValidOneDriveAccessTokenLocal(connection);
  let xmlRootItem: OneDriveItemEntry;
  try {
    xmlRootItem = await resolveOneDriveItemByPath(accessToken, connection.driveId, ONEDRIVE_XML_ROOT_PATH);
  } catch {
    if (!warnedMissingOneDrivePath) {
      warnedMissingOneDrivePath = true;
      log.warn({ path: ONEDRIVE_XML_ROOT_PATH }, 'Pasta OneDrive de XML nao encontrada');
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
  } catch {
    if (!warnedMissingOneDrivePdfPath) {
      warnedMissingOneDrivePdfPath = true;
      log.warn({ path: ONEDRIVE_PDF_ROOT_PATH }, 'Pasta OneDrive de PDF nao encontrada');
    }
  }

  if (copiedXmlCount > 0 || copiedPdfCount > 0) {
    const triggerLabel = trigger === 'interval' ? 'periodica' : trigger === 'startup' ? 'inicial' : 'manual';
    log.info({ trigger: triggerLabel, copiedXml: copiedXmlCount, copiedPdf: copiedPdfCount, xmlDir: copyTargetDir, pdfDir: pdfTargetDir }, 'Copia OneDrive concluida');
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
        log.warn({ candidates: copySourceCandidates }, 'Copia automatica ativa, mas pasta de origem nao encontrada');
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
      log.info({ trigger: triggerLabel, copiedCount, source: sourceRoot, target: copyTargetDir }, 'Copia local concluida');
      await drainImportQueue();
    }
  } catch (error) {
    log.error({ err: error }, 'Falha na copia automatica de XML');
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
    log.info({ trigger: tag, folderCount: foldersToReconcile.length, pendingCount }, 'Reconciliacao completa concluida');
  } catch (error) {
    log.error({ err: error }, 'Falha na reconciliacao completa');
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

  log.info({ nextRunAt: nextRunAt.toISOString(), intervalMinutes: 30 }, 'Reconciliacao completa agendada');

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
    log.error({ err: error, rootDir: watchRootDir }, 'Nao foi possivel identificar pasta mais recente');
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
    log.error({ err: error }, 'Erro no watcher da pasta atual');
  });

  log.info({ folder: nextLatest }, 'Monitorando pasta ativa');
  await reconcileLatestFolder(nextLatest);
}

async function startWatchers(forceReconcile = true): Promise<void> {
  const selectedRoot = await selectExistingWatchRoot();

  if (!selectedRoot) {
    if (!warnedMissingRoot) {
      warnedMissingRoot = true;
      log.warn({ candidates: watchRootCandidates }, 'Nenhuma pasta de XML encontrada');
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
    log.info({ rootDir: watchRootDir }, 'Pasta raiz ativa');
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
      log.error({ err: error }, 'Erro no watcher raiz');
    });

    log.info({ rootDir: watchRootDir }, 'Watcher raiz iniciado');
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
    log.info('Inicializando sync de XML via OneDrive/source copy');
    void runCopyFromSource('startup');

    if (!copyFromSourceTimer) {
      copyFromSourceTimer = setInterval(() => {
        void runCopyFromSource('interval');
      }, COPY_FROM_SOURCE_INTERVAL_MS);
    }
  }

  if (!localXmlWatchEnabled) {
    log.info('Monitoramento local de filesystem desativado via LOCAL_XML_WATCH_ENABLED');
    return;
  }

  log.info('Inicializando monitoramento local de XML');

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
