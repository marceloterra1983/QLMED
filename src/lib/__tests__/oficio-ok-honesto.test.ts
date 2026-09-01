import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphMailboxError } from '@/lib/graph-mail-client';
import type { CassemsIngestDeps, CassemsStorePort } from '@/lib/cassems/ingest';
import type { ImpcgIngestDeps, ImpcgStorePort } from '@/lib/impcg/ingest';

/**
 * QLMED-JOB-004 — `ok` era true sempre que o lock fosse adquirido, e
 * `lastSuccessAt` avançava para agora mesmo num tick que perdeu caixa, upload ou
 * gravação. Batimento de tick não é sucesso de pipeline.
 *
 * O caso que importa é a falha PARCIAL: uma caixa falha, outra passa. O ofício
 * que entrou tem de continuar entrando, e o `ok` tem de vir false com o
 * `lastSuccessAt` anterior intacto.
 */

const OFICIO_IMPCG = `
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
LOCAL DE ENTREGA: HOSPITAL PRONCOR
TOTAL GERAL: 12.550,00
`.trim();

const OFICIO_CASSEMS = `
CASSEMS AUTORIZACAO 2479325231
PACIENTE: DOUGLAS BARBOSA FELIPE
DATA: 28/08/2026
TOTAL GERAL: 4.760,00
`.trim();

const LAST_SUCCESS = new Date('2026-08-01T09:00:00.000Z');
const BACKFILL_DONE = new Date('2026-07-01T09:00:00.000Z');

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  impcgMailIngestLockKey: (companyId: string) => `impcg-mail-ingest:${companyId}`,
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

type IngestState = {
  lastSuccessAt: Date | null;
  backfillCompletedAt: Date | null;
  lastError: string | null;
};

const memory = vi.hoisted(() => ({
  persisted: [] as string[],
  state: null as IngestState | null,
}));

function storeWithState(): ImpcgStorePort & CassemsStorePort {
  return {
    async findSourceByInternetMessageId() {
      return null;
    },
    async findByOficioNumber() {
      return null;
    },
    async persistConfirmed(input: { oficioNumber: string }) {
      memory.persisted.push(input.oficioNumber);
      return { id: `auth-${memory.persisted.length}` };
    },
    async persistUpgrade() {},
    async persistIssuedAt() {},
    async persistSourceOnly() {},
    async loadIngestState() {
      return memory.state;
    },
    async saveIngestState(_companyId: string, patch: Partial<IngestState>) {
      memory.state = {
        lastSuccessAt: patch.lastSuccessAt === undefined
          ? memory.state?.lastSuccessAt ?? null
          : patch.lastSuccessAt,
        backfillCompletedAt: patch.backfillCompletedAt === undefined
          ? memory.state?.backfillCompletedAt ?? null
          : patch.backfillCompletedAt,
        lastError: patch.lastError === undefined ? memory.state?.lastError ?? null : patch.lastError,
      };
    },
  } as unknown as ImpcgStorePort & CassemsStorePort;
}

function impcgMessage(mailbox: string) {
  return {
    graphMessageId: `graph-${mailbox}`,
    internetMessageId: `<${mailbox}@compras>`,
    subject: 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR',
    receivedAt: new Date('2026-08-28T16:31:00.000Z'),
    hasAttachments: true,
  };
}

function impcgDeps(overrides: Partial<ImpcgIngestDeps> = {}): ImpcgIngestDeps {
  return {
    mail: {
      async listMessages(mailbox: string) {
        return [impcgMessage(mailbox)];
      },
      async getPdfAttachments() {
        return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: async () => ({ itemId: 'od-1' }) },
    folder: null,
    extractText: async () => OFICIO_IMPCG,
    store: storeWithState(),
    whatsapp: null,
    ...overrides,
  };
}

function cassemsDeps(overrides: Partial<CassemsIngestDeps> = {}): CassemsIngestDeps {
  return {
    mail: {
      async listMessages() {
        return [{
          graphMessageId: 'graph-cassems',
          internetMessageId: '<msg@cassems>',
          subject: 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE',
          receivedAt: new Date('2026-08-28T16:31:00.000Z'),
          hasAttachments: true,
        }];
      },
      async getPdfAttachments() {
        return [{ name: 'autorizacao.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
      },
    },
    drive: { uploadPdf: async () => ({ itemId: 'od-1' }) },
    folder: null,
    extractText: async () => OFICIO_CASSEMS,
    store: storeWithState(),
    whatsapp: null,
    ...overrides,
  } as CassemsIngestDeps;
}

describe('JOB-004 — ok honesto na falha parcial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memory.persisted.length = 0;
    memory.state = {
      lastSuccessAt: LAST_SUCCESS,
      backfillCompletedAt: BACKFILL_DONE,
      lastError: null,
    };
  });

  it('IMPCG: uma caixa falha e outra passa ⇒ ok:false com lastSuccessAt intacto', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      impcgDeps({
        mail: {
          async listMessages(mailbox: string) {
            // A primeira caixa cai; a segunda entrega um ofício válido.
            if (mailbox.startsWith('marcelo')) throw new GraphMailboxError('Forbidden', 403);
            return [impcgMessage(mailbox)];
          },
          async getPdfAttachments() {
            return [{ name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') }];
          },
        },
      }),
    );

    expect(memory.persisted).toEqual(['17673']);
    expect(result.processed).toBe(1);
    expect(result.failedMailboxes).toEqual(['marcelo']);
    expect(result.ok).toBe(false);
    expect(memory.state?.lastSuccessAt).toBe(LAST_SUCCESS);
    expect(result.lastCollectedAt).toBe(LAST_SUCCESS.toISOString());
    expect(memory.state?.lastError).toBeTruthy();
  });

  it('IMPCG: tick sem erro nenhum avança lastSuccessAt', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest('co1', impcgDeps());

    expect(result.ok).toBe(true);
    expect(memory.state?.lastSuccessAt).not.toBe(LAST_SUCCESS);
    expect(memory.state?.lastSuccessAt).toBeInstanceOf(Date);
  });

  it('IMPCG: falha de upload ⇒ ok:false e lastSuccessAt intacto', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      impcgDeps({
        drive: {
          async uploadPdf() {
            throw new Error('Falha na API do OneDrive: 503');
          },
        },
      }),
    );

    expect(result.failedUploads).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
    expect(memory.state?.lastSuccessAt).toBe(LAST_SUCCESS);
  });

  it('IMPCG: tick parcial não declara backfillCompletedAt', async () => {
    memory.state = { lastSuccessAt: null, backfillCompletedAt: null, lastError: null };

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      impcgDeps({
        mail: {
          async listMessages() {
            throw new GraphMailboxError('Forbidden', 403);
          },
          async getPdfAttachments() {
            return [];
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(memory.state?.backfillCompletedAt).toBeNull();
    expect(memory.state?.lastSuccessAt).toBeNull();
    expect(result.lastCollectedAt).toBeNull();
  });

  it('IMPCG: aviso WhatsApp que falha mantém ok:false', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    const result = await runImpcgIngest(
      'co1',
      impcgDeps({
        whatsapp: {
          jid: '120363000000000000@g.us',
          port: {
            async sendDocument() {
              throw new Error('Evolution respondeu 500');
            },
          },
        },
      }),
    );

    // O ofício entra: aviso é canal, não é a autorização (SPEC-031 FR-007).
    expect(memory.persisted).toContain('17673');
    expect(result.ok).toBe(false);
    expect(memory.state?.lastSuccessAt).toBe(LAST_SUCCESS);
  });

  it('CASSEMS: falha de upload ⇒ ok:false e lastSuccessAt intacto', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest(
      'co1',
      cassemsDeps({
        drive: {
          async uploadPdf() {
            throw new Error('Falha na API do OneDrive: 503');
          },
        },
      }),
    );

    expect(result.failedUploads).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
    expect(memory.state?.lastSuccessAt).toBe(LAST_SUCCESS);
    expect(result.lastCollectedAt).toBe(LAST_SUCCESS.toISOString());
  });

  it('CASSEMS: tick sem erro nenhum avança lastSuccessAt', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest('co1', cassemsDeps());

    expect(result.ok).toBe(true);
    expect(memory.persisted).toEqual(['2479325231']);
    expect(memory.state?.lastSuccessAt).not.toBe(LAST_SUCCESS);
  });

  it('CASSEMS: caixa em 403 ⇒ ok:false', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    const result = await runCassemsIngest(
      'co1',
      cassemsDeps({
        mail: {
          async listMessages() {
            throw new GraphMailboxError('Forbidden', 403);
          },
          async getPdfAttachments() {
            return [];
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    expect(result.failedMailboxes).toEqual(['joseroberto']);
    expect(memory.state?.lastSuccessAt).toBe(LAST_SUCCESS);
  });
});
