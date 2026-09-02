import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphMailboxError } from '@/lib/graph-mail-client';
import type { CassemsIngestDeps, CassemsStorePort, PersistArgs } from '@/lib/cassems/ingest';
import { OFICIO_2479325231_TEXT } from './cassems-parse-oficio.test';

type AuthRow = {
  id: string;
  oficioNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  patientName: string;
  oneDriveItemId: string;
  totalCents: number;
  itemCount: number;
  fileName: string;
};

const memory = vi.hoisted(() => ({
  authorizations: [] as AuthRow[],
  seq: 1,
}));

const ports = vi.hoisted(() => ({
  listMessages: vi.fn(),
  getPdfAttachments: vi.fn(),
  uploadPdf: vi.fn(),
  listPdfs: vi.fn(),
  downloadPdf: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

function resetMemory() {
  memory.authorizations.length = 0;
  memory.seq = 1;
}

function memoryStore(): CassemsStorePort {
  return {
    async findSourceByInternetMessageId() {
      return null;
    },
    async findByOficioNumber(_companyId, oficioNumber) {
      return memory.authorizations.find((row) => row.oficioNumber === oficioNumber) ?? null;
    },
    async persistConfirmed(input: PersistArgs) {
      const id = `auth-${memory.seq++}`;
      memory.authorizations.push({
        id,
        oficioNumber: input.oficioNumber,
        parseStatus: input.parseStatus,
        patientName: input.patientName,
        oneDriveItemId: input.oneDriveItemId,
        totalCents: input.totalCents,
        itemCount: input.items.length,
        fileName: input.fileName,
      });
      return { id };
    },
    async persistUpgrade(input: PersistArgs & { authorizationId: string }) {
      const row = memory.authorizations.find((item) => item.id === input.authorizationId);
      if (!row) throw new Error('authorization missing');
      row.parseStatus = input.parseStatus;
      row.patientName = input.patientName;
      row.oneDriveItemId = input.oneDriveItemId;
      row.totalCents = input.totalCents;
      row.itemCount = input.items.length;
      row.fileName = input.fileName;
    },
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
  };
}

function folderFile() {
  return {
    itemId: 'od-folder-modelo',
    name: 'CASSEMS001 - Oficio de materiais OPME autorizados 28-08-2026-133128021.pdf',
    lastModifiedAt: new Date('2026-08-30T14:26:49.000Z'),
  };
}

function deps(): CassemsIngestDeps {
  return {
    mail: {
      listMessages: ports.listMessages,
      getPdfAttachments: ports.getPdfAttachments,
    },
    drive: { uploadPdf: ports.uploadPdf },
    folder: {
      listPdfs: ports.listPdfs,
      downloadPdf: ports.downloadPdf,
    },
    extractText: ports.extractText,
    store: memoryStore(),
  };
}

describe('ingest CASSEMS — varredura da pasta OneDrive (modelo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    ports.listMessages.mockResolvedValue([]);
    ports.getPdfAttachments.mockResolvedValue([]);
    ports.uploadPdf.mockResolvedValue({ itemId: 'should-not-upload' });
    ports.listPdfs.mockResolvedValue([folderFile()]);
    ports.downloadPdf.mockResolvedValue(Buffer.from('%PDF-1.4 fixture'));
    ports.extractText.mockResolvedValue(OFICIO_2479325231_TEXT);
  });

  it('PDF modelo já na pasta cria uma linha sem reenviar (AC-013)', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('2479325231');
    expect(memory.authorizations[0]?.patientName).toBe('DOUGLAS BARBOSA FELIPE');
    expect(memory.authorizations[0]?.oneDriveItemId).toBe('od-folder-modelo');
    expect(memory.authorizations[0]?.itemCount).toBe(2);
    expect(memory.authorizations[0]?.totalCents).toBe(476000);
    expect(memory.authorizations[0]?.fileName).toContain('CASSEMS001');
    expect(new Decimal(memory.authorizations[0]?.totalCents ?? 0).div(100).toFixed(2)).toBe('4760.00');
    expect(ports.uploadPdf).not.toHaveBeenCalled();
    expect(ports.downloadPdf).toHaveBeenCalledWith('od-folder-modelo');
    expect(result.processed).toBe(1);
    expect(result.failedUploads).toBe(0);
  });

  it('segunda varredura do mesmo PDF não duplica', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps());
    const second = await runCassemsIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('2479325231');
    expect(second.processed).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(ports.uploadPdf).not.toHaveBeenCalled();
  });

  it('Graph Mail 403 ainda importa o PDF da pasta (FAIL-001)', async () => {
    ports.listMessages.mockRejectedValue(new GraphMailboxError('Forbidden', 403));

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest('co1', deps());

    expect(result.failedMailboxes).toEqual(['joseroberto']);
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('2479325231');
    expect(ports.uploadPdf).not.toHaveBeenCalled();
    // QLMED-JOB-004: a pasta salva o que dá para salvar, mas o tick perdeu a
    // caixa. Este teste afirmava `ok: true` — era a asserção que protegia o
    // defeito. O que importa aqui é que a pasta entrou, não que o tick mentiu.
    expect(result.ok).toBe(false);
    expect(result.processed).toBe(1);
  });
});
