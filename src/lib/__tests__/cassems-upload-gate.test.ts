import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CassemsIngestDeps, CassemsStorePort, PersistArgs } from '@/lib/cassems/ingest';
import { OFICIO_2479325231_TEXT } from './cassems-parse-oficio.test';

const memory = vi.hoisted(() => ({
  authorizations: [] as Array<{ id: string; oficioNumber: string }>,
  persistConfirmed: vi.fn(),
  persistUpgrade: vi.fn(),
}));

const ports = vi.hoisted(() => ({
  listMessages: vi.fn(),
  getPdfAttachments: vi.fn(),
  uploadPdf: vi.fn(),
  extractText: vi.fn(),
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

function memoryStore(): CassemsStorePort {
  return {
    async findSourceByInternetMessageId() {
      return null;
    },
    async findByOficioNumber() {
      return null;
    },
    async persistConfirmed(input: PersistArgs) {
      memory.persistConfirmed(input);
      const row = { id: `auth-${memory.authorizations.length + 1}`, oficioNumber: input.oficioNumber };
      memory.authorizations.push(row);
      return row;
    },
    async persistUpgrade(input: PersistArgs & { authorizationId: string }) {
      memory.persistUpgrade(input);
    },
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
  };
}

describe('ingest CASSEMS — gate de upload OneDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.authorizations.length = 0;
    ports.extractText.mockResolvedValue(OFICIO_2479325231_TEXT);
    ports.getPdfAttachments.mockResolvedValue([
      { name: 'oficio.pdf', content: Buffer.from('%PDF-1.4 fixture') },
    ]);
    ports.listMessages.mockResolvedValue([
      {
        graphMessageId: 'graph-1',
        internetMessageId: '<upload-fail@cassems>',
        subject: 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE',
        receivedAt: new Date('2026-08-28T16:31:00.000Z'),
        hasAttachments: true,
      },
    ]);
  });

  it('upload OneDrive falhou ⇒ zero CassemsAuthorization confirmada (FAIL-002)', async () => {
    ports.uploadPdf.mockRejectedValue(new Error('Falha na API do OneDrive: 503'));
    const deps: CassemsIngestDeps = {
      mail: {
        listMessages: ports.listMessages,
        getPdfAttachments: ports.getPdfAttachments,
      },
      drive: { uploadPdf: ports.uploadPdf },
      extractText: ports.extractText,
      store: memoryStore(),
    };

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest('co1', deps);

    expect(ports.uploadPdf).toHaveBeenCalled();
    expect(memory.authorizations).toHaveLength(0);
    expect(memory.persistConfirmed).not.toHaveBeenCalled();
    expect(memory.persistUpgrade).not.toHaveBeenCalled();
    expect(result.failedUploads).toBeGreaterThan(0);
  });
});
