import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImpcgIngestDeps, ImpcgStorePort, PersistArgs } from '@/lib/impcg/ingest';

const OFICIO_17673_TEXT = `
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
KIT VALVULA AORTICA MECANICA           SORIN       A5         1    6.500,00    6.500,00
KIT CEC                                EUROSETS    AG5214     1    5.500,00    5.500,00
KIT CANULAS                            BIOMEDICAL  KITPER     1      550,00      550,00
TOTAL GERAL: 12.550,00
`.trim();

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
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
}));

function memoryStore(): ImpcgStorePort {
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
    async persistIssuedAt() {},
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
  };
}

describe('ingest IMPCG — gate de upload OneDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.authorizations.length = 0;
    ports.extractText.mockResolvedValue(OFICIO_17673_TEXT);
    ports.getPdfAttachments.mockResolvedValue([
      { name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') },
    ]);
    ports.listMessages.mockResolvedValue([
      {
        graphMessageId: 'graph-1',
        internetMessageId: '<upload-fail@compras>',
        subject: 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR',
        receivedAt: new Date('2023-08-10T15:00:00.000Z'),
        hasAttachments: true,
      },
    ]);
  });

  it('upload OneDrive falhou ⇒ zero ImpcgAuthorization confirmada (FAIL-002)', async () => {
    ports.uploadPdf.mockRejectedValue(new Error('Falha na API do OneDrive: 503'));
    const deps: ImpcgIngestDeps = {
      mail: {
        listMessages: ports.listMessages,
        getPdfAttachments: ports.getPdfAttachments,
      },
      drive: { uploadPdf: ports.uploadPdf },
      extractText: ports.extractText,
      store: memoryStore(),
    };

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps);

    expect(ports.uploadPdf).toHaveBeenCalled();
    expect(memory.authorizations).toHaveLength(0);
    expect(memory.persistConfirmed).not.toHaveBeenCalled();
    expect(memory.persistUpgrade).not.toHaveBeenCalled();
    expect(result.failedUploads).toBeGreaterThan(0);
  });
});
