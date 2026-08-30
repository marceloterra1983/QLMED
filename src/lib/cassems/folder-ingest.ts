import prisma from '@/lib/prisma';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import {
  downloadOneDriveItemContent,
  ensureOneDriveFolder,
  listOneDriveChildren,
  type OneDriveItem,
} from '@/lib/onedrive-client';
import { CASSEMS_ONEDRIVE_ACCOUNT, CASSEMS_ONEDRIVE_FOLDER } from './constants';
import { oficioFromFileName, parseOficio, shouldUpgrade, type ParsedCassemsItem } from './parse-oficio';

export type CassemsFolderFile = {
  itemId: string;
  name: string;
  lastModifiedAt: Date | null;
};

export type CassemsFolderPort = {
  listPdfs(): Promise<CassemsFolderFile[]>;
  downloadPdf(itemId: string): Promise<Buffer>;
};

export type CassemsFolderPersist = {
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
  items: ParsedCassemsItem[];
};

export type CassemsFolderStore = {
  findByOficioNumber(
    companyId: string,
    oficioNumber: string,
  ): Promise<{
    id: string;
    parseStatus: 'ok' | 'parcial' | 'falha';
    oneDriveItemId: string;
  } | null>;
  persistConfirmed(input: CassemsFolderPersist): Promise<{ id: string }>;
  persistUpgrade(input: CassemsFolderPersist & { authorizationId: string }): Promise<void>;
};

export async function resolveCassemsOneDrive(companyId: string): Promise<{
  accessToken: string;
  driveId: string;
}> {
  const connection = await prisma.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: CASSEMS_ONEDRIVE_ACCOUNT },
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

export async function defaultCassemsFolderPort(companyId: string): Promise<CassemsFolderPort> {
  const { accessToken, driveId } = await resolveCassemsOneDrive(companyId);
  const folder = await ensureOneDriveFolder(accessToken, driveId, CASSEMS_ONEDRIVE_FOLDER);
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
 * Lê PDFs já na pasta CASSEMS. Não reenvia.
 * Sem número de autorização após parse, não cria linha.
 * Não usa o carimbo do nome do modelo (133128021) como autorização.
 */
export async function ingestCassemsFolder(input: {
  companyId: string;
  folder: CassemsFolderPort;
  extractText: (pdf: Buffer) => Promise<string>;
  store: CassemsFolderStore;
}): Promise<{ processed: number; skipped: number }> {
  let processed = 0;
  let skipped = 0;
  const files = await input.folder.listPdfs();

  for (const file of files) {
    const guessed = oficioFromFileName(file.name);
    if (guessed) {
      const existing = await input.store.findByOficioNumber(input.companyId, guessed);
      if (existing && existing.parseStatus !== 'falha') {
        skipped += 1;
        continue;
      }
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

    const persistBase: CassemsFolderPersist = {
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

    if (
      shouldUpgrade(existing.parseStatus, parsed.parseStatus)
      || (existing.parseStatus === 'falha' && existing.oneDriveItemId !== file.itemId)
    ) {
      await input.store.persistUpgrade({ ...persistBase, authorizationId: existing.id });
      processed += 1;
      continue;
    }

    skipped += 1;
  }

  return { processed, skipped };
}
