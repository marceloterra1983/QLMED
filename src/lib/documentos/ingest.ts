import type { CompanyDocumentKind } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { acquirePostgresAdvisoryLock, documentosIngestLockKey } from '@/lib/postgres-advisory-lock';
import {
  markBackgroundServiceError,
  markBackgroundServiceHeartbeat,
  markBackgroundServiceStarted,
  sanitizeError,
} from '@/lib/background-service-health';
import { getSingleCompany } from '@/lib/single-company';
import {
  DOCUMENTOS_FAMILIES,
  DOCUMENTOS_INGEST_INTERVAL_MS,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  familyByCategory,
  familyForKind,
  familyScanTargets,
  kindExpires,
  type DocumentosCategory,
} from './constants';
import { cartaManufacturerKey, classifyDocument } from './classify';
import {
  balancoYearFromFolderName,
  balancoYearFromLooseFile,
  kindStoresFilenameDate,
  lastPathSegment,
  type DocumentosFamily,
} from './families';
import { daysRemaining, extractValidUntil, selectVigente, todayInSaoPaulo, toYmd } from './validity';
import { readValidityFromPdf } from './pdf-validity';
import { createDocumentosFolderPort } from './onedrive-port';
import type { DocumentosAlertDeps } from './alerts';
import { listOneDriveChildren, type OneDriveItem } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';

export { sanitizeError };

/**
 * SPEC-042 — contrato da ingestão de certidões (OneDrive → CompanyDocument).
 *
 * Este ficheiro nasce como CONTRATO para permitir que a folha L5 (rotas) e a
 * folha L4 (ingestão) avancem em paralelo em worktrees separados. A L4
 * substitui os corpos; a L5 só importa daqui e nunca edita este ficheiro.
 */

export type DocumentosFolderFile = {
  itemId: string;
  name: string;
  size: number | null;
  lastModifiedAt: Date | null;
  webUrl?: string | null;
};

export type DocumentosFolderChild = {
  itemId: string;
  name: string;
  size: number | null;
  lastModifiedAt: Date | null;
  webUrl: string | null;
  folder: boolean;
};

export type DocumentosFolderPort = {
  /** Lista os PDFs diretos de `folderPath` (caminho completo a partir da raiz do drive). */
  listPdfs(folderPath: string): Promise<DocumentosFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
  /** Move o item para a pasta Vencidas da família. Não apaga. */
  moveToArchive(itemId: string, familyRoot: string): Promise<void>;
  /** Filhos (pastas e ficheiros) de `folderPath`. Usado por scan='yearFolders'. */
  listChildren?(folderPath: string): Promise<DocumentosFolderChild[]>;
};

/**
 * Uma linha por ano: primeiro as SUBPASTAS `BALANÇO YYYY`; depois, ficheiros
 * soltos `BALANÇO YYYY.zip`/`.pdf` só para anos sem pasta. O resto é ruído.
 */
export function selectYearFolderItems(children: DocumentosFolderChild[]): DocumentosFolderChild[] {
  const byYear = new Map<number, DocumentosFolderChild>();
  for (const child of children) {
    if (!child.folder) continue;
    const year = balancoYearFromFolderName(child.name);
    if (year == null) continue;
    if (!byYear.has(year)) byYear.set(year, child);
  }
  for (const child of children) {
    if (child.folder) continue;
    const year = balancoYearFromLooseFile(child.name);
    if (year == null || byYear.has(year)) continue;
    byYear.set(year, child);
  }
  return [...byYear.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([, item]) => item);
}

/** Documento novo cuja validade supera a do vigente anterior do mesmo tipo. */
export type RenewalEvent = {
  companyId: string;
  kind: CompanyDocumentKind;
  documentId: string;
  previousValidUntil: string | null;
  validUntil: string;
};

export type DocumentosIngestResult = {
  scanned: number;
  upserted: number;
  removed: number;
  renewals: RenewalEvent[];
  arquivados: number;
  skippedFamilies: DocumentosCategory[];
};

/** Outra ingestão já detém o advisory lock desta empresa. Rotas respondem 409. */
export class DocumentosIngestBusyError extends Error {
  constructor() {
    super('ingestão de documentos já em curso');
    this.name = 'DocumentosIngestBusyError';
  }
}

const log = createLogger('documentos/ingest');

function dateFromYmd(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function fileSizeOf(size: number | null): number | null {
  if (size == null || !Number.isFinite(size)) return null;
  return Math.trunc(size);
}

type ExistingRow = {
  id: string;
  kind: CompanyDocumentKind;
  category: string | null;
  validUntil: Date | null;
  removedAt: Date | null;
  oneDriveItemId: string;
  validUntilSource: string | null;
  renewalNotifiedAt: Date | null;
};

async function saveIngestSuccess(companyId: string, now: Date, lastError: string | null = null): Promise<void> {
  await prisma.companyDocumentIngestState.upsert({
    where: { companyId },
    create: {
      companyId,
      lastSuccessAt: now,
      lastError,
      lastErrorAt: lastError ? now : null,
    },
    update: {
      lastSuccessAt: now,
      lastError,
      lastErrorAt: lastError ? now : null,
    },
  });
}

function isMissingFolderError(error: unknown): boolean {
  return error instanceof Error && /pasta não encontrada/i.test(error.message);
}

async function resolveIngestValidity(opts: {
  kind: CompanyDocumentKind;
  fileName: string;
  itemId: string;
  port: DocumentosFolderPort;
  now: Date;
}): Promise<{ validUntil: Date | null; validUntilSource: string | null }> {
  if (!kindStoresFilenameDate(opts.kind)) {
    return { validUntil: null, validUntilSource: null };
  }
  const fromName = extractValidUntil(opts.fileName);
  if (fromName) {
    return { validUntil: dateFromYmd(fromName.date), validUntilSource: 'filename' };
  }
  try {
    const pdf = await readValidityFromPdf(
      await opts.port.downloadPdf(opts.itemId),
      todayInSaoPaulo(opts.now),
    );
    if (pdf.validUntil) {
      return { validUntil: dateFromYmd(pdf.validUntil), validUntilSource: 'pdf' };
    }
  } catch {
    // PDF ilegível ou download falhou: linha fica Sem data; o ciclo segue.
  }
  return { validUntil: null, validUntilSource: null };
}

async function saveIngestError(companyId: string, now: Date, error: unknown): Promise<void> {
  const lastError = sanitizeError(error instanceof Error ? error.message : 'ingestão falhou');
  await prisma.companyDocumentIngestState.upsert({
    where: { companyId },
    create: { companyId, lastError, lastErrorAt: now },
    update: { lastError, lastErrorAt: now },
  });
}

function isRenewal(input: {
  persistedYmd: string | null;
  renewalNotifiedAt: Date | null;
  previousYmd: string | null;
  hadPreviousVigente: boolean;
  kindExisted: boolean;
}): boolean {
  if (!input.persistedYmd || input.renewalNotifiedAt) return false;
  if (input.hadPreviousVigente) {
    return input.previousYmd == null || input.persistedYmd > input.previousYmd;
  }
  // Vigente anterior inexistente, mas o kind já tinha linha: não é primeira carga.
  return input.kindExisted;
}

type UpsertInput = {
  companyId: string;
  family: DocumentosFamily;
  kind: CompanyDocumentKind;
  fileName: string;
  itemId: string;
  folderName: string;
  fileSize: number | null;
  lastModifiedAt: Date | null;
  webUrl: string | null;
  validUntil: Date | null;
  validUntilSource: string | null;
};

async function upsertItem(
  input: UpsertInput,
  existing: ExistingRow | undefined,
): Promise<{ id: string; validUntil: Date | null; renewalNotifiedAt: Date | null }> {
  if (!existing) {
    return prisma.companyDocument.create({
      data: {
        companyId: input.companyId,
        category: input.family.category,
        kind: input.kind,
        fileName: input.fileName,
        oneDriveItemId: input.itemId,
        oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
        folderName: input.folderName,
        fileSize: fileSizeOf(input.fileSize),
        lastModifiedAt: input.lastModifiedAt,
        webUrl: input.webUrl,
        validUntil: input.validUntil,
        validUntilSource: input.validUntilSource,
        removedAt: null,
      },
      select: { id: true, validUntil: true, renewalNotifiedAt: true },
    });
  }
  const nextValidUntil = existing.validUntilSource === 'manual' ? existing.validUntil : input.validUntil;
  const validityChanged = toYmd(existing.validUntil) !== toYmd(nextValidUntil);
  return prisma.companyDocument.update({
    where: { id: existing.id },
    data: {
      fileName: input.fileName,
      fileSize: fileSizeOf(input.fileSize),
      lastModifiedAt: input.lastModifiedAt,
      folderName: input.folderName,
      category: input.family.category,
      kind: input.kind,
      webUrl: input.webUrl,
      removedAt: null,
      ...(existing.validUntilSource === 'manual'
        ? {}
        : { validUntil: input.validUntil, validUntilSource: input.validUntilSource }),
      ...(validityChanged ? { alertedThresholds: [], renewalNotifiedAt: null } : {}),
    },
    select: { id: true, validUntil: true, renewalNotifiedAt: true },
  });
}

async function ingestCompany(
  companyId: string,
  port: DocumentosFolderPort,
  now: Date,
): Promise<DocumentosIngestResult> {
  const existingRows = (await prisma.companyDocument.findMany({
    where: { companyId, oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT },
    select: {
      id: true,
      kind: true,
      category: true,
      validUntil: true,
      removedAt: true,
      oneDriveItemId: true,
      validUntilSource: true,
      renewalNotifiedAt: true,
    },
  })) as ExistingRow[];

  const vigenteByKind = selectVigente(existingRows);
  const kindsSeenBefore = new Set(existingRows.map((row) => row.kind));
  const byItemId = new Map(existingRows.map((row) => [row.oneDriveItemId, row]));

  const seenIds = new Set<string>();
  const renewals: RenewalEvent[] = [];
  const skippedFamilies: DocumentosCategory[] = [];
  let scanned = 0;
  let upserted = 0;

  for (const family of DOCUMENTOS_FAMILIES) {
    try {
      if (family.scan === 'yearFolders') {
        /**
         * Não conseguir enumerar NUNCA pode virar "pasta vazia": o `updateMany`
         * mais abaixo marca `removedAt` em tudo que não entrou em `seenIds`.
         * Falta de capacidade na porta continua abortando o ciclo. Pasta
         * inexistente no OneDrive é outra coisa: salta só esta família.
         */
        if (!port.listChildren) {
          throw new Error(
            `família '${family.category}' exige listChildren e a porta não o expõe`,
          );
        }
        const children = await port.listChildren(family.root);
        const selected = selectYearFolderItems(children);
        const folderName = lastPathSegment(family.root);
        for (const item of selected) {
          scanned += 1;
          seenIds.add(item.itemId);
          await upsertItem(
            {
              companyId,
              family,
              kind: 'balanco_anual',
              fileName: item.name,
              itemId: item.itemId,
              folderName,
              fileSize: item.size,
              lastModifiedAt: item.lastModifiedAt,
              webUrl: item.webUrl,
              validUntil: null,
              validUntilSource: null,
            },
            byItemId.get(item.itemId),
          );
          upserted += 1;
        }
        continue;
      }

      for (const target of familyScanTargets(family)) {
        const files = await port.listPdfs(target.path);
        for (const file of files) {
          scanned += 1;
          seenIds.add(file.itemId);

          const kind = classifyDocument(target.folderName, file.name, family.category);
          const { validUntil, validUntilSource } = await resolveIngestValidity({
            kind,
            fileName: file.name,
            itemId: file.itemId,
            port,
            now,
          });
          const existing = byItemId.get(file.itemId);

          const previous = vigenteByKind.get(kind);
          const previousYmd = previous ? toYmd(previous.validUntil) : null;

          const row = await upsertItem(
            {
              companyId,
              family,
              kind,
              fileName: file.name,
              itemId: file.itemId,
              folderName: target.folderName,
              fileSize: file.size,
              lastModifiedAt: file.lastModifiedAt,
              webUrl: file.webUrl ?? null,
              validUntil,
              validUntilSource,
            },
            existing,
          );

          upserted += 1;

          if (
            family.mode === 'closed' &&
            kindExpires(kind) &&
            isRenewal({
              persistedYmd: toYmd(row.validUntil),
              renewalNotifiedAt: row.renewalNotifiedAt,
              previousYmd,
              hadPreviousVigente: Boolean(previous),
              kindExisted: kindsSeenBefore.has(kind),
            })
          ) {
            // Consumidor (L7): gravar renewalNotifiedAt ANTES do envio.
            // Reinício entre envio e escrita duplica o aviso (FR-011).
            renewals.push({
              companyId,
              kind,
              documentId: row.id,
              previousValidUntil: previousYmd,
              validUntil: toYmd(row.validUntil) as string,
            });
          }
        }
      }
    } catch (error) {
      if (!isMissingFolderError(error)) throw error;
      skippedFamilies.push(family.category);
      log.warn({ family: family.category }, 'documentos_ingest_family_folder_missing');
    }
  }

  const protectedKinds = skippedFamilies.flatMap(
    (category) => familyByCategory(category).kinds.map((kind) => kind.kind),
  );

  // removedAt deste ciclo ANTES de arquivar: um ficheiro que sumiu agora não
  // pode contar como substituto (hasLaterSubstitute lê removedAt: null).
  // Família que não deu para enumerar fica de fora — senão "pasta em falta"
  // apagaria as linhas já gravadas.
  const removed = await prisma.companyDocument.updateMany({
    where: {
      companyId,
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      removedAt: null,
      oneDriveItemId: { notIn: [...seenIds] },
      ...(protectedKinds.length > 0 ? { kind: { notIn: protectedKinds } } : {}),
    },
    data: { removedAt: now },
  });

  const arquivados = await archiveExpiredDocuments(companyId, port, now);

  const result: DocumentosIngestResult = {
    scanned,
    upserted,
    removed: removed.count,
    renewals,
    arquivados,
    skippedFamilies,
  };

  const skipWarning =
    skippedFamilies.length > 0
      ? `famílias sem pasta no OneDrive: ${skippedFamilies.join(', ')}`
      : null;
  await saveIngestSuccess(companyId, now, skipWarning);
  log.info(
    {
      scanned: result.scanned,
      upserted: result.upserted,
      removed: result.removed,
      renewals: result.renewals.length,
      arquivados: result.arquivados,
      skippedFamilies: result.skippedFamilies,
    },
    'documentos_ingest_ok',
  );
  return result;
}

type ArchiveCandidate = {
  id: string;
  kind: CompanyDocumentKind;
  fileName: string;
  validUntil: Date | null;
  validUntilSource: string | null;
  oneDriveItemId: string;
};

function archiveGroupKey(row: ArchiveCandidate, family: DocumentosFamily): string {
  if (family.mode === 'open') return `open:${cartaManufacturerKey(row.fileName)}`;
  return `kind:${row.kind}`;
}

function hasLaterSubstitute(row: ArchiveCandidate, siblings: ArchiveCandidate[]): boolean {
  const ymd = toYmd(row.validUntil);
  if (!ymd) return false;
  return siblings.some((other) => {
    if (other.id === row.id) return false;
    const otherYmd = toYmd(other.validUntil);
    return otherYmd != null && otherYmd > ymd;
  });
}

/**
 * Move para Vencidas só o que já tem substituto. Falha da pasta aborta o
 * ciclo de arquivo (fail-closed) e não derruba a ingestão.
 */
async function archiveExpiredDocuments(
  companyId: string,
  port: DocumentosFolderPort,
  now: Date,
): Promise<number> {
  const today = todayInSaoPaulo(now);
  const live = (await prisma.companyDocument.findMany({
    where: {
      companyId,
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      removedAt: null,
    },
    select: {
      id: true,
      kind: true,
      fileName: true,
      validUntil: true,
      validUntilSource: true,
      oneDriveItemId: true,
    },
  })) as ArchiveCandidate[];

  const byGroup = new Map<string, { family: DocumentosFamily; rows: ArchiveCandidate[] }>();
  for (const row of live) {
    const family = familyForKind(row.kind);
    if (!family) continue;
    if (!kindExpires(row.kind)) continue;
    const key = `${family.category}:${archiveGroupKey(row, family)}`;
    const group = byGroup.get(key);
    if (group) group.rows.push(row);
    else byGroup.set(key, { family, rows: [row] });
  }

  const candidates: { row: ArchiveCandidate; family: DocumentosFamily }[] = [];
  for (const group of byGroup.values()) {
    for (const row of group.rows) {
      const ymd = toYmd(row.validUntil);
      if (!ymd) continue;
      if (daysRemaining(today, ymd) >= 0) continue;
      if (!hasLaterSubstitute(row, group.rows)) continue;
      candidates.push({ row, family: group.family });
    }
  }

  if (candidates.length === 0) return 0;

  let arquivados = 0;
  try {
    for (const { row, family } of candidates) {
      await port.moveToArchive(row.oneDriveItemId, family.root);
      arquivados += 1;
      log.info({ kind: row.kind, fileName: row.fileName }, 'documentos_archived');
    }
  } catch (error) {
    log.warn(
      { err: sanitizeError(error instanceof Error ? error.message : 'archive') },
      'documentos_archive_failed',
    );
  }
  return arquivados;
}

function sameFolderName(left: string, right: string): boolean {
  return left.normalize('NFC').trim() === right.normalize('NFC').trim();
}

function mapGraphChild(item: OneDriveItem): DocumentosFolderChild {
  return {
    itemId: item.id,
    name: item.name,
    size: typeof item.size === 'number' && Number.isFinite(item.size) ? item.size : null,
    lastModifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
    webUrl: item.webUrl ?? null,
    folder: Boolean(item.folder),
  };
}

async function mergeWebUrl(
  files: DocumentosFolderFile[],
  children: DocumentosFolderChild[],
): Promise<DocumentosFolderFile[]> {
  if (files.every((file) => file.webUrl)) return files;
  const byId = new Map(children.map((child) => [child.itemId, child]));
  return files.map((file) => ({
    ...file,
    webUrl: file.webUrl ?? byId.get(file.itemId)?.webUrl ?? null,
  }));
}

/**
 * A porta de produção (onedrive-port, noutro worktree) lista PDFs sem webUrl
 * e sem filhos. Este wrap usa listOneDriveChildren, que já devolve pastas e
 * webUrl, sem editar esse ficheiro.
 */
async function enhancePort(companyId: string, base: DocumentosFolderPort): Promise<DocumentosFolderPort> {
  if (base.listChildren) {
    return {
      ...base,
      async listPdfs(folderPath: string) {
        const files = await base.listPdfs(folderPath);
        return mergeWebUrl(files, await base.listChildren!(folderPath));
      },
    };
  }

  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
  });
  if (!connection) return base;

  const accessToken = await ensureValidOneDriveAccessToken(connection);
  const { driveId } = connection;
  const folderIdByPath = new Map<string, string>();

  async function folderId(folderPath: string): Promise<string> {
    const cached = folderIdByPath.get(folderPath);
    if (cached) return cached;
    const segments = folderPath.split('/').map((part) => part.trim()).filter(Boolean);
    let currentId = 'root';
    for (const segment of segments) {
      const children = await listOneDriveChildren(accessToken, driveId, currentId);
      const match = children.find((item) => item.folder && sameFolderName(item.name || '', segment));
      if (!match) throw new Error('pasta não encontrada');
      currentId = match.id;
    }
    folderIdByPath.set(folderPath, currentId);
    return currentId;
  }

  async function listChildren(folderPath: string): Promise<DocumentosFolderChild[]> {
    const id = await folderId(folderPath);
    const items = await listOneDriveChildren(accessToken, driveId, id);
    return items.map(mapGraphChild);
  }

  return {
    async listPdfs(folderPath: string) {
      const files = await base.listPdfs(folderPath);
      return mergeWebUrl(files, await listChildren(folderPath));
    },
    downloadPdf: (itemId) => base.downloadPdf(itemId),
    moveToArchive: (itemId, familyRoot) => base.moveToArchive(itemId, familyRoot),
    listChildren,
  };
}

export async function runDocumentosIngest(
  companyId: string,
  port?: DocumentosFolderPort,
  now: Date = new Date(),
  alertDeps?: DocumentosAlertDeps,
): Promise<DocumentosIngestResult> {
  const lock = await acquirePostgresAdvisoryLock(documentosIngestLockKey(companyId));
  if (!lock) {
    throw new DocumentosIngestBusyError();
  }

  try {
    const folderPort = port ?? (await enhancePort(companyId, await createDocumentosFolderPort(companyId)));
    const result = await ingestCompany(companyId, folderPort, now);
    if (result.renewals.length > 0) {
      try {
        const { notifyRenewals } = await import('./alerts');
        await notifyRenewals(result.renewals, {
          ...alertDeps,
          port: alertDeps?.port ?? folderPort,
        });
      } catch (error) {
        log.warn(
          { err: sanitizeError(error instanceof Error ? error.message : 'renewal') },
          'documentos_renewal_notify_failed',
        );
      }
    }
    return result;
  } catch (error) {
    try {
      await saveIngestError(companyId, now, error);
    } catch {
      // O erro original da ingestão é o que o caller precisa; falha ao gravar
      // o estado não o substitui.
    }
    log.warn(
      {
        err: sanitizeError(error instanceof Error ? error.message : 'ingest'),
        stack: sanitizeError(String(error && (error as { stack?: string }).stack ? (error as { stack?: string }).stack : '')),
      },
      'documentos_ingest_failed',
    );
    throw error;
  } finally {
    await lock.release();
  }
}

/** Registrado no bootstrap pela L4; respeita QLMED_DISABLE_BACKGROUND_SERVICES. */
export function startDocumentosIngest(): void {
  const disabled = process.env.QLMED_DISABLE_BACKGROUND_SERVICES === 'true';
  markBackgroundServiceStarted('documentos-ingest', {
    enabled: !disabled,
    heartbeatIntervalMs: DOCUMENTOS_INGEST_INTERVAL_MS,
  });
  if (disabled) return;

  const tick = async () => {
    markBackgroundServiceHeartbeat('documentos-ingest');
    try {
      const company = await getSingleCompany();
      if (!company) return;
      await runDocumentosIngest(company.id);
    } catch (error) {
      markBackgroundServiceError('documentos-ingest', error);
      log.error(
        {
          err: sanitizeError(error instanceof Error ? error.message : 'ingest'),
          stack: sanitizeError(String(error && (error as { stack?: string }).stack ? (error as { stack?: string }).stack : '')),
        },
        'documentos_ingest_tick_failed',
      );
    }
  };

  setTimeout(() => {
    void tick();
    setInterval(() => {
      void tick();
    }, DOCUMENTOS_INGEST_INTERVAL_MS);
  }, 5_000);
}
