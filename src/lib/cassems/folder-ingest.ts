import { resolveAccountOneDrive } from '@/lib/onedrive-connections';
import {
  createOneDriveFolderPort,
  type OneDriveFolderFile,
  type OneDriveFolderPort,
} from '@/lib/onedrive-folder-port';
import { CASSEMS_ONEDRIVE_ACCOUNT, CASSEMS_ONEDRIVE_FOLDER } from './constants';
import { oficioFromFileName, parseOficio, shouldUpgrade, type ParsedCassemsItem } from './parse-oficio';

export type CassemsFolderFile = OneDriveFolderFile;
export type CassemsFolderPort = OneDriveFolderPort;

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
  return resolveAccountOneDrive(companyId, CASSEMS_ONEDRIVE_ACCOUNT, {
    errorMessage: 'conta de arquivo nao conectada',
  });
}

function subjectFromFileName(name: string): string {
  return name.replace(/\.pdf$/i, '').trim();
}

export async function defaultCassemsFolderPort(companyId: string): Promise<CassemsFolderPort> {
  return createOneDriveFolderPort({
    companyId,
    accountEmail: CASSEMS_ONEDRIVE_ACCOUNT,
    folderName: CASSEMS_ONEDRIVE_FOLDER,
    errorMessage: 'conta de arquivo nao conectada',
  });
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
