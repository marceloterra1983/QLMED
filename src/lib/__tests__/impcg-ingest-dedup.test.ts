import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ImpcgIngestDeps, ImpcgStorePort, PersistArgs } from '@/lib/impcg/ingest';

const OFICIO_17673_TEXT = `
INSTITUTO MUNICIPAL DE PREVIDENCIA DE CAMPO GRANDE
ORDEM DE FORNECIMENTO N 17673
DATA: 10/08/2023
PACIENTE: PLINIO ANTONIO ARANHA JUNIOR
MATRICULA: 66429737-4
MEDICO: RODRIGO LUIZ ROCHA CARDOSO
CRM: 13716
PROCEDIMENTO: TROCA VALVAR
LOCAL DE ENTREGA: HOSPITAL PRONCOR
ITENS APROVADOS
DESCRICAO                              MARCA       REF      QTD   UNITARIO     TOTAL
KIT VALVULA AORTICA MECANICA           SORIN       A5         1    6.500,00    6.500,00
KIT CEC                                EUROSETS    AG5214     1    5.500,00    5.500,00
KIT CANULAS                            BIOMEDICAL  KITPER     1      550,00      550,00
TOTAL GERAL: 12.550,00
`.trim();

type AuthRow = {
  id: string;
  oficioNumber: string;
  parseStatus: 'ok' | 'parcial' | 'falha';
  patientName: string;
  oneDriveItemId: string;
  totalCents: number;
};

type SourceRow = {
  id: string;
  internetMessageId: string;
  mailbox: string;
  authorizationId: string | null;
};

type IngestState = {
  lastSuccessAt: Date | null;
  backfillCompletedAt: Date | null;
  lastError: string | null;
};

const memory = vi.hoisted(() => ({
  authorizations: [] as AuthRow[],
  sources: [] as SourceRow[],
  ingestState: null as IngestState | null,
  seq: 1,
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

function resetMemory() {
  memory.authorizations.length = 0;
  memory.sources.length = 0;
  memory.ingestState = null;
  memory.seq = 1;
}

function memoryStore(): ImpcgStorePort {
  return {
    async findSourceByInternetMessageId(_companyId, internetMessageId) {
      const row = memory.sources.find((item) => item.internetMessageId === internetMessageId);
      return row ? { id: row.id, authorizationId: row.authorizationId } : null;
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
      });
      memory.sources.push({
        id: `src-${memory.seq++}`,
        internetMessageId: input.internetMessageId ?? '',
        mailbox: input.mailbox ?? '',
        authorizationId: id,
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
      memory.sources.push({
        id: `src-${memory.seq++}`,
        internetMessageId: input.internetMessageId ?? '',
        mailbox: input.mailbox ?? '',
        authorizationId: input.authorizationId,
      });
    },
    async persistSourceOnly(input) {
      if (memory.sources.some((row) => row.internetMessageId === input.internetMessageId)) return;
      memory.sources.push({
        id: `src-${memory.seq++}`,
        internetMessageId: input.internetMessageId,
        mailbox: input.mailbox,
        authorizationId: input.authorizationId,
      });
    },
    async loadIngestState() {
      return memory.ingestState;
    },
    async saveIngestState(_companyId, patch) {
      memory.ingestState = {
        lastSuccessAt: patch.lastSuccessAt ?? memory.ingestState?.lastSuccessAt ?? null,
        backfillCompletedAt: patch.backfillCompletedAt ?? memory.ingestState?.backfillCompletedAt ?? null,
        lastError: patch.lastError === undefined ? memory.ingestState?.lastError ?? null : patch.lastError,
      };
    },
  };
}

function mailMessage(overrides: {
  graphMessageId?: string;
  internetMessageId?: string;
  subject?: string;
} = {}) {
  return {
    graphMessageId: overrides.graphMessageId ?? 'graph-1',
    internetMessageId: overrides.internetMessageId ?? '<CA17673@compras.impcg>',
    subject: overrides.subject ?? 'OF 17673 PLINIO ANTONIO ARANHA JUNIOR',
    receivedAt: new Date('2023-08-10T15:00:00.000Z'),
    hasAttachments: true,
  };
}

function deps(): ImpcgIngestDeps {
  return {
    mail: {
      listMessages: ports.listMessages,
      getPdfAttachments: ports.getPdfAttachments,
    },
    drive: { uploadPdf: ports.uploadPdf },
    extractText: ports.extractText,
    store: memoryStore(),
  };
}

const SAME_MESSAGE_ID = '<CA17673@compras.impcg>';

describe('ingest IMPCG — dedup e upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    ports.extractText.mockResolvedValue(OFICIO_17673_TEXT);
    ports.uploadPdf.mockResolvedValue({ itemId: 'od-17673' });
    ports.getPdfAttachments.mockResolvedValue([
      { name: 'ordem.pdf', content: Buffer.from('%PDF-1.4 fixture') },
    ]);
    ports.listMessages.mockImplementation(async (mailbox: string) => [
      mailMessage({ graphMessageId: `graph-${mailbox}` }),
    ]);
  });

  it('mesmo internetMessageId nas duas caixas cria uma autorização (AC-006)', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(memory.sources.filter((row) => row.internetMessageId === SAME_MESSAGE_ID)).toHaveLength(1);
    expect(ports.listMessages).toHaveBeenCalled();
    expect(ports.uploadPdf).toHaveBeenCalledTimes(1);
  });

  it('mesmo oficioNumber em mensagens distintas permanece uma linha (AC-007)', async () => {
    ports.listMessages.mockImplementation(async (mailbox: string) => {
      const internetMessageId = mailbox.includes('marcelo')
        ? '<msg-marcelo@compras>'
        : '<msg-flavio@compras>';
      return [mailMessage({ internetMessageId, graphMessageId: `graph-${internetMessageId}` })];
    });

    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('17673');
    expect(new Decimal(memory.authorizations[0]?.totalCents ?? 0).div(100).toFixed(2)).toBe('12550.00');
    expect(Number.isInteger(memory.authorizations[0]?.totalCents)).toBe(true);
    expect(memory.sources).toHaveLength(2);
  });

  it('só atualiza se o parse novo for melhor: ok > parcial > falha (AC-007)', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');

    memory.authorizations.push({
      id: 'auth-seed',
      oficioNumber: '17673',
      parseStatus: 'falha',
      patientName: 'PACIENTE',
      oneDriveItemId: 'od-seed',
      totalCents: 0,
    });

    async function ingestWith(text: string, internetMessageId: string) {
      ports.extractText.mockResolvedValue(text);
      ports.listMessages.mockResolvedValue([
        mailMessage({ internetMessageId, graphMessageId: `graph-${internetMessageId}` }),
      ]);
      await runImpcgIngest('co1', deps());
    }

    await ingestWith(
      'ORDEM DE FORNECIMENTO N 17673\nPACIENTE: PLINIO ANTONIO ARANHA JUNIOR\nTOTAL GERAL: 12.550,00',
      '<parcial@compras>',
    );
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('parcial');

    await ingestWith(OFICIO_17673_TEXT, '<ok@compras>');
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('ok');
    expect(memory.authorizations[0]?.totalCents).toBe(1255000);

    await ingestWith('', '<downgrade@compras>');
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('ok');
  });

  it('marca backfillCompletedAt e lastSuccessAt na primeira coleta (T028)', async () => {
    const { runImpcgIngest } = await import('@/lib/impcg/ingest');
    await runImpcgIngest('co1', deps());

    expect(memory.ingestState?.backfillCompletedAt).toBeInstanceOf(Date);
    expect(memory.ingestState?.lastSuccessAt).toBeInstanceOf(Date);
    expect(memory.ingestState?.lastError).toBeNull();
  });
});
