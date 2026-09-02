import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImpcgIngestDeps, ImpcgStorePort } from '@/lib/impcg/ingest';

/**
 * QLMED-JOB-002 — `persistSourceOnly` engolia QUALQUER erro como conflito de
 * dedup. Banco indisponível virava "essa mensagem já existe" e a coleta seguia
 * dando o ofício por guardado.
 */

const mocks = vi.hoisted(() => ({
  impcgCreate: vi.fn(),
  cassemsCreate: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    impcgSourceMessage: { create: mocks.impcgCreate },
    cassemsSourceMessage: { create: mocks.cassemsCreate },
  },
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

function uniqueViolation() {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

const sourceInput = {
  companyId: 'co1',
  authorizationId: 'auth-1',
  mailbox: 'marcelo@qlmed.com.br',
  graphMessageId: 'graph-1',
  internetMessageId: '<dup@compras>',
  receivedAt: new Date('2026-08-28T16:31:00.000Z'),
};

describe('JOB-002 — dedup de source message', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('IMPCG: P2002 continua sendo skip silencioso', async () => {
    mocks.impcgCreate.mockRejectedValue(uniqueViolation());
    const { persistSourceOnly } = await import('@/lib/impcg/store');
    await expect(persistSourceOnly(sourceInput)).resolves.toBeUndefined();
  });

  it('IMPCG: erro genérico do banco não é engolido como dedup', async () => {
    mocks.impcgCreate.mockRejectedValue(new Error('connection terminated'));
    const { persistSourceOnly } = await import('@/lib/impcg/store');
    await expect(persistSourceOnly(sourceInput)).rejects.toThrow('connection terminated');
  });

  it('CASSEMS: P2002 continua sendo skip silencioso', async () => {
    mocks.cassemsCreate.mockRejectedValue(uniqueViolation());
    const { persistSourceOnly } = await import('@/lib/cassems/store');
    await expect(persistSourceOnly(sourceInput)).resolves.toBeUndefined();
  });

  it('CASSEMS: erro genérico do banco não é engolido como dedup', async () => {
    mocks.cassemsCreate.mockRejectedValue(new Error('connection terminated'));
    const { persistSourceOnly } = await import('@/lib/cassems/store');
    await expect(persistSourceOnly(sourceInput)).rejects.toThrow('connection terminated');
  });

  it('IMPCG: erro genérico na origem conta como falha do tick, não como skip', async () => {
    const store: ImpcgStorePort = {
      async findSourceByInternetMessageId() {
        return null;
      },
      async findByOficioNumber() {
        return {
          id: 'auth-existente',
          oficioNumber: '17673',
          parseStatus: 'ok',
          patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
          oneDriveItemId: 'od-arquivado',
        };
      },
      async persistConfirmed() {
        return { id: 'auth-1' };
      },
      async persistUpgrade() {},
      async persistIssuedAt() {},
      async persistSourceOnly() {
        throw new Error('connection terminated');
      },
      async loadIngestState() {
        return null;
      },
      async saveIngestState() {},
    };

    const deps: ImpcgIngestDeps = {
      mail: {
        async listMessages() {
          return [{
            graphMessageId: 'graph-1',
            internetMessageId: '<dup@compras>',
            subject: 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR',
            receivedAt: new Date('2026-08-28T16:31:00.000Z'),
            hasAttachments: true,
          }];
        },
        async getPdfAttachments() {
          return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
        },
      },
      drive: { uploadPdf: async () => ({ itemId: 'od-novo' }) },
      folder: null,
      extractText: async () => [
        'ORDEM DE FORNECIMENTO N 17673',
        'DATA: 10/08/2023',
        'PACIENTE: PLINIO ANTONIO ARANHA JUNIOR',
        'TOTAL GERAL: 12.550,00',
      ].join('\n'),
      store,
      whatsapp: null,
    };

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', deps);

    expect(result.failedPersists).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });
});
