import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  listOneDriveChildren,
  type OneDriveItem,
} from '@/lib/onedrive-client';
import { IMPCG_ONEDRIVE_ACCOUNT, IMPCG_ONEDRIVE_FOLDER } from './constants';
import { normalizeOficioNumber, parseOficio, shouldUpgrade, type ParsedImpcgItem } from './parse-oficio';

export type ImpcgFolderFile = {
  itemId: string;
  name: string;
  lastModifiedAt: Date | null;
};

export type ImpcgFolderPort = {
  listPdfs(): Promise<ImpcgFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
};

export type ImpcgFolderPersist = {
  companyId: string;
  oficioNumber: string;
  issuedAt: Date | null;
  patientName: string;
  patientRegistry: string | null;
  doctorName: string | null;
  doctorCrm: string | null;
  procedureName: string | null;
  hospitalName: string | null;
  totalCents: number;
  parseStatus: 'ok' | 'parcial' | 'falha';
  fileName: string;
  oneDriveItemId: string;
  receivedAt: Date;
  items: ParsedImpcgItem[];
};

export type ImpcgFolderStore = {
  findByOficioNumber(
    companyId: string,
    oficioNumber: string,
  ): Promise<{
    id: string;
    parseStatus: 'ok' | 'parcial' | 'falha';
    oneDriveItemId: string;
    issuedAt?: Date | null;
    doctorName?: string | null;
    doctorCrm?: string | null;
  } | null>;
  persistConfirmed(input: ImpcgFolderPersist): Promise<{ id: string }>;
  persistUpgrade(input: ImpcgFolderPersist & { authorizationId: string }): Promise<void>;
  persistIssuedAt(authorizationId: string, issuedAt: Date): Promise<void>;
};

export async function resolveImpcgOneDrive(companyId: string): Promise<{
  accessToken: string;
  driveId: string;
}> {
  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: IMPCG_ONEDRIVE_ACCOUNT },
  }) ?? await prisma.oneDriveConnection.findFirst({
    where: { companyId },
    orderBy: { updatedAt: 'desc' },
  });
  if (!connection) {
    throw new Error('conta de arquivo nao conectada');
  }
  const accessToken = await ensureValidOneDriveAccessToken(connection);
  return { accessToken, driveId: connection.driveId };
}

function isPdfItem(item: OneDriveItem): boolean {
  if (item.folder) return false;
  const name = item.name || '';
  return name.toLowerCase().endsWith('.pdf') || item.file?.mimeType === 'application/pdf';
}

function subjectFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim();
}

function oficioFromFileName(name: string): string | null {
  const subject = subjectFromFileName(name);
  const match = /(?:oficio|of|ordem)\s*(\d{1,20})/i.exec(subject);
  return normalizeOficioNumber(match?.[1] ?? null);
}

export async function defaultImpcgFolderPort(companyId: string): Promise<ImpcgFolderPort> {
  const { accessToken, driveId } = await resolveImpcgOneDrive(companyId);
  const folder = await ensureOneDriveFolder(accessToken, driveId, IMPCG_ONEDRIVE_FOLDER);
  return {
    async listPdfs() {
      const children = await listOneDriveChildren(accessToken, driveId, folder.id);
      return children.filter(isPdfItem).map((item) => ({
        itemId: item.id,
        name: item.name,
        lastModifiedAt: item.lastModifiedDateTime ? new Date(item.lastModifiedDateTime) : null,
      }));
    },
    async downloadPdf(itemId: string) {
      return downloadOneDriveItemContent(accessToken, driveId, itemId);
    },
  };
}

/**
 * Lê PDFs já na pasta IMPCG. Não reenvia (FAIL-002 não se aplica).
 * Sem número de ofício após parse+nome do arquivo, não cria linha nem inventa itens.
 */
export async function ingestImpcgFolder(input: {
  companyId: string;
  folder: ImpcgFolderPort;
  extractText: (pdf: Buffer) => Promise<string>;
  store: ImpcgFolderStore;
}): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;
  const files = await input.folder.listPdfs();

  for (const file of files) {
    const guessed = oficioFromFileName(file.name);
    if (guessed) {
      const existing = await input.store.findByOficioNumber(input.companyId, guessed);
      if (existing && existing.parseStatus === 'falha' && existing.oneDriveItemId === file.itemId) {
        skipped += 1;
        continue;
      }
    }

    const content = await input.folder.downloadPdf(file.itemId);
    const text = await input.extractText(content);
    const parsed = parseOficio(text, subjectFromFileName(file.name));
    if (!parsed.oficioNumber) {
      skipped += 1;
      continue;
    }

    const persistBase: ImpcgFolderPersist = {
      companyId: input.companyId,
      oficioNumber: parsed.oficioNumber,
      issuedAt: parsed.issuedAt,
      patientName: parsed.patientName,
      patientRegistry: parsed.patientRegistry,
      doctorName: parsed.doctorName,
      doctorCrm: parsed.doctorCrm,
      procedureName: parsed.procedureName,
      hospitalName: parsed.hospitalName,
      totalCents: parsed.totalCents ?? 0,
      parseStatus: parsed.parseStatus,
      fileName: file.name,
      oneDriveItemId: file.itemId,
      receivedAt: file.lastModifiedAt ?? new Date(),
      items: parsed.items,
    };

    const existing = await input.store.findByOficioNumber(input.companyId, parsed.oficioNumber);
    if (!existing) {
      await input.store.persistConfirmed(persistBase);
      processed += 1;
      continue;
    }

    const fillsDate = existing.parseStatus === 'parcial' && !existing.issuedAt && Boolean(parsed.issuedAt);
    const fillsDoctor = existing.parseStatus === 'parcial'
      && !existing.doctorName
      && Boolean(parsed.doctorName);
    const fillsCrm = existing.parseStatus === 'parcial'
      && !existing.doctorCrm
      && Boolean(parsed.doctorCrm);
    const dateChanged = Boolean(parsed.issuedAt)
      && existing.issuedAt?.getTime() !== parsed.issuedAt?.getTime();
    if (
      shouldUpgrade(existing.parseStatus, parsed.parseStatus)
      || fillsDate
      || fillsDoctor
      || fillsCrm
      || (existing.parseStatus === 'falha' && existing.oneDriveItemId !== file.itemId)
    ) {
      await input.store.persistUpgrade({ ...persistBase, authorizationId: existing.id });
      processed += 1;
      continue;
    }
    if (dateChanged && parsed.issuedAt) {
      await input.store.persistIssuedAt(existing.id, parsed.issuedAt);
      processed += 1;
      continue;
    }

    skipped += 1;
  }

  return { processed, skipped };
}
