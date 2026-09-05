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
import { CERTIDAO_FOLDER, CERTIDAO_KINDS_ORDER, DOCUMENTOS_INGEST_INTERVAL_MS, DOCUMENTOS_ONEDRIVE_ACCOUNT } from './constants';
import { classifyDocument } from './classify';
import { daysRemaining, extractValidUntil, selectVigente, todayInSaoPaulo, toYmd } from './validity';
import { createDocumentosFolderPort } from './onedrive-port';
import type { DocumentosAlertDeps } from './alerts';

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
};

export type DocumentosFolderPort = {
  /** Lista os PDFs diretos de uma subpasta de DOCUMENTOS_ONEDRIVE_ROOT. */
  listPdfs(folderName: string): Promise<DocumentosFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
  /** Move o item para a pasta Vencidas. Não apaga. */
  moveToArchive(itemId: string): Promise<void>;
};

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
};

/** Outra ingestão já detém o advisory lock desta empresa. Rotas respondem 409. */
export class DocumentosIngestBusyError extends Error {
  constructor() {
    super('ingestão de documentos já em curso');
    this.name = 'DocumentosIngestBusyError';
  }
}

const log = createLogger('documentos/ingest');

const CERTIDAO_FOLDERS = [...new Set(Object.values(CERTIDAO_FOLDER))];

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
  validUntil: Date | null;
  removedAt: Date | null;
  oneDriveItemId: string;
  validUntilSource: string | null;
  renewalNotifiedAt: Date | null;
};

async function saveIngestSuccess(companyId: string, now: Date): Promise<void> {
  await prisma.companyDocumentIngestState.upsert({
    where: { companyId },
    create: { companyId, lastSuccessAt: now, lastError: null, lastErrorAt: null },
    update: { lastSuccessAt: now, lastError: null, lastErrorAt: null },
  });
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
  let scanned = 0;
  let upserted = 0;

  for (const folderName of CERTIDAO_FOLDERS) {
    const files = await port.listPdfs(folderName);
    for (const file of files) {
      scanned += 1;
      seenIds.add(file.itemId);

      const kind = classifyDocument(folderName, file.name);
      const extracted = extractValidUntil(file.name);
      const validUntil = extracted ? dateFromYmd(extracted.date) : null;
      const validUntilSource = extracted ? 'filename' : null;
      const existing = byItemId.get(file.itemId);

      const previous = vigenteByKind.get(kind);
      const previousYmd = previous ? toYmd(previous.validUntil) : null;

      let row: {
        id: string;
        validUntil: Date | null;
        renewalNotifiedAt: Date | null;
      };

      if (!existing) {
        row = await prisma.companyDocument.create({
          data: {
            companyId,
            kind,
            fileName: file.name,
            oneDriveItemId: file.itemId,
            oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
            folderName,
            fileSize: fileSizeOf(file.size),
            lastModifiedAt: file.lastModifiedAt,
            validUntil,
            validUntilSource,
            removedAt: null,
          },
          select: { id: true, validUntil: true, renewalNotifiedAt: true },
        });
      } else {
        const nextValidUntil = existing.validUntilSource === 'manual' ? existing.validUntil : validUntil;
        const validityChanged = toYmd(existing.validUntil) !== toYmd(nextValidUntil);
        row = await prisma.companyDocument.update({
          where: { id: existing.id },
          data: {
            fileName: file.name,
            fileSize: fileSizeOf(file.size),
            lastModifiedAt: file.lastModifiedAt,
            folderName,
            kind,
            removedAt: null,
            ...(existing.validUntilSource === 'manual'
              ? {}
              : { validUntil, validUntilSource }),
            ...(validityChanged ? { alertedThresholds: [], renewalNotifiedAt: null } : {}),
          },
          select: { id: true, validUntil: true, renewalNotifiedAt: true },
        });
      }

      upserted += 1;

      if (
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

  // removedAt deste ciclo ANTES de arquivar: um ficheiro que sumiu agora não
  // pode contar como substituto (hasLaterSubstitute lê removedAt: null).
  const removed = await prisma.companyDocument.updateMany({
    where: {
      companyId,
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      removedAt: null,
      oneDriveItemId: { notIn: [...seenIds] },
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
  };

  await saveIngestSuccess(companyId, now);
  log.info(
    {
      scanned: result.scanned,
      upserted: result.upserted,
      removed: result.removed,
      renewals: result.renewals.length,
      arquivados: result.arquivados,
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

const CERTIDAO_KIND_SET = new Set<string>(CERTIDAO_KINDS_ORDER);

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

  const byKind = new Map<CompanyDocumentKind, ArchiveCandidate[]>();
  for (const row of live) {
    if (!CERTIDAO_KIND_SET.has(row.kind)) continue;
    const list = byKind.get(row.kind);
    if (list) list.push(row);
    else byKind.set(row.kind, [row]);
  }

  const candidates: ArchiveCandidate[] = [];
  for (const rows of byKind.values()) {
    for (const row of rows) {
      const ymd = toYmd(row.validUntil);
      if (!ymd) continue;
      if (daysRemaining(today, ymd) >= 0) continue;
      if (!hasLaterSubstitute(row, rows)) continue;
      candidates.push(row);
    }
  }

  if (candidates.length === 0) return 0;

  let arquivados = 0;
  try {
    for (const row of candidates) {
      await port.moveToArchive(row.oneDriveItemId);
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
    const folderPort = port ?? (await createDocumentosFolderPort(companyId));
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
