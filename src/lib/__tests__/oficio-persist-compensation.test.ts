import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CassemsIngestDeps, CassemsStorePort } from '@/lib/cassems/ingest';
import type { ImpcgIngestDeps, ImpcgStorePort } from '@/lib/impcg/ingest';

/**
 * QLMED-JOB-001 — o PDF subia para o OneDrive antes de existir linha no banco.
 * Falha na persistência deixava o objeto lá, carregando dado clínico, sem nada
 * apontando para ele — e o tick seguinte reenviava por cima.
 *
 * A correção é coleta de órfão por compensação, não "upload dentro da
 * transação": um PUT no Graph não se inscreve numa transação Postgres.
 */

const OFICIO_IMPCG = `
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
TOTAL GERAL: 12.550,00
`.trim();

const OFICIO_CASSEMS = `
CASSEMS AUTORIZACAO 2479325231
PACIENTE: DOUGLAS BARBOSA FELIPE
DATA: 28/08/2026
TOTAL GERAL: 4.760,00
`.trim();

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

const ports = vi.hoisted(() => ({
  uploadPdf: vi.fn(),
  deletePdf: vi.fn(),
  persistConfirmed: vi.fn(),
  persistUpgrade: vi.fn(),
}));

function message(internetMessageId: string, subject: string) {
  return {
    graphMessageId: `graph-${internetMessageId}`,
    internetMessageId,
    subject,
    receivedAt: new Date('2026-08-28T16:31:00.000Z'),
    hasAttachments: true,
  };
}

function baseStore(): ImpcgStorePort & CassemsStorePort {
  return {
    async findSourceByInternetMessageId() {
      return null;
    },
    async findByOficioNumber() {
      return null;
    },
    persistConfirmed: ports.persistConfirmed as unknown as ImpcgStorePort['persistConfirmed'],
    persistUpgrade: ports.persistUpgrade as unknown as ImpcgStorePort['persistUpgrade'],
    async persistIssuedAt() {},
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
  } as ImpcgStorePort & CassemsStorePort;
}

function impcgDeps(overrides: Partial<ImpcgIngestDeps> = {}): ImpcgIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [message('<orfao@compras>', 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR')];
      },
      async getPdfAttachments() {
        return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: ports.uploadPdf, deletePdf: ports.deletePdf },
    folder: null,
    extractText: async () => OFICIO_IMPCG,
    store: baseStore(),
    whatsapp: null,
    ...overrides,
  };
}

function cassemsDeps(overrides: Partial<CassemsIngestDeps> = {}): CassemsIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [message('<orfao@cassems>', 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE')];
      },
      async getPdfAttachments() {
        return [{ name: 'autorizacao.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: ports.uploadPdf, deletePdf: ports.deletePdf },
    folder: null,
    extractText: async () => OFICIO_CASSEMS,
    store: baseStore(),
    whatsapp: null,
    ...overrides,
  };
}

describe('JOB-001 — órfão no OneDrive após falha de persist', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ports.uploadPdf.mockResolvedValue({ itemId: 'od-novo' });
    ports.deletePdf.mockResolvedValue(undefined);
    ports.persistConfirmed.mockResolvedValue({ id: 'auth-1' });
    ports.persistUpgrade.mockResolvedValue(undefined);
  });

  it('IMPCG: persist falha ⇒ objeto recém-enviado é apagado', async () => {
    ports.persistConfirmed.mockRejectedValue(new Error('deadlock detected'));

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', impcgDeps());

    // Duas caixas veem a mesma mensagem e nenhuma origem foi gravada, então há
    // um upload por caixa — e uma coleta de órfão para cada um deles.
    expect(ports.uploadPdf.mock.calls.length).toBeGreaterThan(0);
    expect(ports.deletePdf).toHaveBeenCalledWith('od-novo');
    expect(ports.deletePdf.mock.calls.length).toBe(ports.uploadPdf.mock.calls.length);
    expect(result.failedPersists).toBe(ports.uploadPdf.mock.calls.length);
    expect(result.processed).toBe(0);
    expect(result.ok).toBe(false);
  });

  it('IMPCG: falha de persist não aborta o resto do tick', async () => {
    ports.persistConfirmed
      .mockRejectedValueOnce(new Error('deadlock detected'))
      .mockResolvedValueOnce({ id: 'auth-2' });

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      impcgDeps({
        mail: {
          async listMessages(mailbox: string) {
            return [message(`<${mailbox}@compras>`, 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR')];
          },
          async getPdfAttachments() {
            return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
          },
        },
      }),
    );

    // Duas caixas, a primeira falha: antes o throw derrubava o tick inteiro.
    expect(ports.persistConfirmed).toHaveBeenCalledTimes(2);
    expect(result.processed).toBe(1);
    expect(result.failedPersists).toBe(1);
    expect(result.ok).toBe(false);
  });

  it('IMPCG: upgrade que reusa o itemId da linha commitada não apaga o objeto', async () => {
    ports.uploadPdf.mockResolvedValue({ itemId: 'od-arquivado' });
    ports.persistUpgrade.mockRejectedValue(new Error('deadlock detected'));

    const store = baseStore();
    store.findByOficioNumber = async () => ({
      id: 'auth-existente',
      oficioNumber: '17673',
      parseStatus: 'falha' as const,
      patientName: 'PLINIO ANTONIO ARANHA JUNIOR',
      oneDriveItemId: 'od-arquivado',
    });

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', impcgDeps({ store }));

    expect(ports.persistUpgrade).toHaveBeenCalled();
    expect(ports.deletePdf).not.toHaveBeenCalled();
    expect(result.failedPersists).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
  });

  it('IMPCG: delete da compensação falhar vira erro material', async () => {
    ports.persistConfirmed.mockRejectedValue(new Error('deadlock detected'));
    ports.deletePdf.mockRejectedValue(new Error('403 acesso negado'));

    const saved: Array<{ lastError?: string | null; lastSuccessAt?: Date | null }> = [];
    const store = baseStore();
    store.saveIngestState = async (_companyId, patch) => {
      saved.push(patch);
    };

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', impcgDeps({ store }));

    expect(ports.deletePdf).toHaveBeenCalledWith('od-novo');
    expect(result.ok).toBe(false);
    expect(saved[0]?.lastError).toBeTruthy();
    expect(saved[0]?.lastSuccessAt).toBeUndefined();
  });

  it('CASSEMS: persist falha ⇒ objeto recém-enviado é apagado', async () => {
    ports.persistConfirmed.mockRejectedValue(new Error('deadlock detected'));

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest('co1', cassemsDeps());

    expect(ports.uploadPdf).toHaveBeenCalledTimes(1);
    expect(ports.deletePdf).toHaveBeenCalledWith('od-novo');
    expect(result.failedPersists).toBe(1);
    expect(result.processed).toBe(0);
    expect(result.ok).toBe(false);
  });

  it('CASSEMS: sem porta de delete o órfão vira erro material declarado', async () => {
    ports.persistConfirmed.mockRejectedValue(new Error('deadlock detected'));

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest(
      'co1',
      cassemsDeps({ drive: { uploadPdf: ports.uploadPdf } }),
    );

    expect(ports.deletePdf).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    expect(result.failedPersists).toBe(1);
  });
});
