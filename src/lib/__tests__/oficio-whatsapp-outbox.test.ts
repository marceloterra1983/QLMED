import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CassemsIngestDeps, CassemsStorePort } from '@/lib/cassems/ingest';
import type { ImpcgIngestDeps, ImpcgStorePort } from '@/lib/impcg/ingest';

/**
 * QLMED-JOB-003 — o aviso saía em processo, logo após persistir, e falha de
 * Evolution era perda definitiva: o tick seguinte via a origem gravada e seguia
 * em frente. `whatsappSentAt` já existia como marcador durável mas não gateava
 * nada.
 *
 * Agora a origem com `whatsappSentAt IS NULL` volta à fila enquanto a janela do
 * aviso (7 dias) estiver aberta — a janela é o teto de tentativas.
 */

const OFICIO_IMPCG = `
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
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

type SourceRow = { authorizationId: string | null; whatsappSentAt: Date | null };

const state = vi.hoisted(() => ({
  sources: new Map<string, { authorizationId: string | null; whatsappSentAt: Date | null }>(),
  authorizations: [] as string[],
  sent: [] as string[],
  uploads: 0,
  attachmentFetches: 0,
  sendFails: true,
}));

function resetState() {
  state.sources.clear();
  state.authorizations.length = 0;
  state.sent.length = 0;
  state.uploads = 0;
  state.attachmentFetches = 0;
  state.sendFails = true;
}

/** Store partilhado entre ticks: é o banco que sobrevive ao tick, no teste. */
function durableStore(): ImpcgStorePort & CassemsStorePort {
  return {
    async findSourceByInternetMessageId(_companyId: string, internetMessageId: string) {
      const row = state.sources.get(internetMessageId) as SourceRow | undefined;
      return row ? { id: internetMessageId, ...row } : null;
    },
    async findByOficioNumber() {
      return null;
    },
    async persistConfirmed(input: { internetMessageId?: string; oficioNumber: string }) {
      state.authorizations.push(input.oficioNumber);
      if (input.internetMessageId) {
        state.sources.set(input.internetMessageId, {
          authorizationId: 'auth-1',
          whatsappSentAt: null,
        });
      }
      return { id: 'auth-1' };
    },
    async persistUpgrade() {},
    async persistIssuedAt() {},
    async persistSourceOnly() {},
    async loadIngestState() {
      return null;
    },
    async saveIngestState() {},
    async markWhatsAppSent(_companyId: string, internetMessageId: string) {
      const row = state.sources.get(internetMessageId);
      if (row) row.whatsappSentAt = new Date();
    },
  } as unknown as ImpcgStorePort & CassemsStorePort;
}

function whatsappTarget() {
  return {
    jid: '120363000000000000@g.us',
    port: {
      async sendDocument(input: { fileName: string }) {
        if (state.sendFails) throw new Error('Evolution respondeu 500');
        state.sent.push(input.fileName);
        return { messageId: 'wamid-1' };
      },
    },
  };
}

function mailPort(receivedAt: Date, internetMessageId: string, subject: string, pdfText: string) {
  return {
    async listMessages() {
      return [{
        graphMessageId: `graph-${internetMessageId}`,
        internetMessageId,
        subject,
        receivedAt,
        hasAttachments: true,
      }];
    },
    async getPdfAttachments() {
      state.attachmentFetches += 1;
      return [{ name: 'oficio.pdf', content: Buffer.from(`%PDF-1.4 ${pdfText.slice(0, 8)}`) }];
    },
  };
}

function impcgDeps(
  overrides: Partial<ImpcgIngestDeps> = {},
  receivedAt = new Date(),
): ImpcgIngestDeps {
  return {
    mail: mailPort(receivedAt, '<retry@compras>', 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR', 'impcg'),
    drive: {
      async uploadPdf() {
        state.uploads += 1;
        return { itemId: 'od-1' };
      },
    },
    folder: null,
    extractText: async () => OFICIO_IMPCG,
    store: durableStore(),
    whatsapp: whatsappTarget(),
    ...overrides,
  };
}

function cassemsDeps(
  overrides: Partial<CassemsIngestDeps> = {},
  receivedAt = new Date(),
): CassemsIngestDeps {
  return {
    mail: mailPort(receivedAt, '<retry@cassems>', 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE', 'cassems'),
    drive: {
      async uploadPdf() {
        state.uploads += 1;
        return { itemId: 'od-1' };
      },
    },
    folder: null,
    extractText: async () => OFICIO_CASSEMS,
    store: durableStore(),
    whatsapp: whatsappTarget(),
    ...overrides,
  } as CassemsIngestDeps;
}

describe('JOB-003 — repetição durável do aviso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetState();
  });

  it('IMPCG: Evolution 500 no 1º tick, entregue no 2º', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');

    const first = await runImpcgIngest('co1', impcgDeps());
    expect(state.sent).toHaveLength(0);
    expect(state.authorizations).toEqual(['17673']);
    expect(state.sources.get('<retry@compras>')?.whatsappSentAt).toBeNull();
    expect(first.ok).toBe(false);

    state.sendFails = false;
    const second = await runImpcgIngest('co1', impcgDeps());

    expect(state.sent).toHaveLength(1);
    expect(state.sources.get('<retry@compras>')?.whatsappSentAt).toBeInstanceOf(Date);
    expect(second.ok).toBe(true);
  });

  it('IMPCG: reenvio não faz upload nem cria autorização nova', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', impcgDeps());
    const uploadsAfterFirst = state.uploads;

    state.sendFails = false;
    await runImpcgIngest('co1', impcgDeps());

    expect(state.uploads).toBe(uploadsAfterFirst);
    expect(state.authorizations).toEqual(['17673']);
  });

  it('IMPCG: whatsappSentAt preenchido não reenvia', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    state.sendFails = false;
    await runImpcgIngest('co1', impcgDeps());
    expect(state.sent).toHaveLength(1);

    await runImpcgIngest('co1', impcgDeps());
    expect(state.sent).toHaveLength(1);
  });

  it('IMPCG: canal desligado não busca anexo da mensagem já processada', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    state.sources.set('<retry@compras>', { authorizationId: 'auth-1', whatsappSentAt: null });
    state.attachmentFetches = 0;

    await runImpcgIngest('co1', impcgDeps({ whatsapp: null }));

    expect(state.attachmentFetches).toBe(0);
  });

  it('IMPCG: fora da janela de aviso não busca anexo', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    state.sources.set('<retry@compras>', { authorizationId: 'auth-1', whatsappSentAt: null });
    state.attachmentFetches = 0;

    await runImpcgIngest('co1', impcgDeps({}, new Date('2018-07-24T12:00:00.000Z')));

    expect(state.attachmentFetches).toBe(0);
  });

  it('CASSEMS: Evolution 500 no 1º tick, entregue no 2º', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');

    const first = await runCassemsIngest('co1', cassemsDeps());
    expect(state.sent).toHaveLength(0);
    expect(first.ok).toBe(false);

    state.sendFails = false;
    const second = await runCassemsIngest('co1', cassemsDeps());

    expect(state.sent).toHaveLength(1);
    expect(state.sources.get('<retry@cassems>')?.whatsappSentAt).toBeInstanceOf(Date);
    expect(second.ok).toBe(true);
  });

  it('CASSEMS: whatsappSentAt preenchido não reenvia', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    state.sendFails = false;
    await runCassemsIngest('co1', cassemsDeps());
    expect(state.sent).toHaveLength(1);

    await runCassemsIngest('co1', cassemsDeps());
    expect(state.sent).toHaveLength(1);
  });
});
