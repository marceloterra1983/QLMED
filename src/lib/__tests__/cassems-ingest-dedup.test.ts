import { Decimal } from '@prisma/client-runtime-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CassemsIngestDeps, CassemsStorePort, PersistArgs } from '@/lib/cassems/ingest';
import { OFICIO_2479325231_TEXT } from './cassems-parse-oficio.test';

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
  cassemsMailIngestLockKey: (companyId: string) => `cassems-mail-ingest:${companyId}`,
}));

function resetMemory() {
  memory.authorizations.length = 0;
  memory.sources.length = 0;
  memory.ingestState = null;
  memory.seq = 1;
}

function memoryStore(): CassemsStorePort {
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
    internetMessageId: overrides.internetMessageId ?? '<CA2479325231@cassems>',
    subject: overrides.subject ?? 'CASSEMS 2479325231 DOUGLAS BARBOSA FELIPE',
    receivedAt: new Date('2026-08-28T16:31:00.000Z'),
    hasAttachments: true,
  };
}

function deps(): CassemsIngestDeps {
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

const SAME_MESSAGE_ID = '<CA2479325231@cassems>';

describe('ingest CASSEMS — dedup e upgrade', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    ports.extractText.mockResolvedValue(OFICIO_2479325231_TEXT);
    ports.uploadPdf.mockResolvedValue({ itemId: 'od-2479325231' });
    ports.getPdfAttachments.mockResolvedValue([
      { name: 'oficio.pdf', content: Buffer.from('%PDF-1.4 fixture') },
    ]);
    ports.listMessages.mockResolvedValue([mailMessage()]);
  });

  it('mesmo internetMessageId processado duas vezes cria uma autorização (AC-006)', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps());
    await runCassemsIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('2479325231');
    expect(memory.sources.filter((row) => row.internetMessageId === SAME_MESSAGE_ID)).toHaveLength(1);
    expect(ports.uploadPdf).toHaveBeenCalledTimes(1);
  });

  it('mesmo oficioNumber em mensagens distintas permanece uma linha (AC-007)', async () => {
    ports.listMessages.mockResolvedValueOnce([
      mailMessage({ internetMessageId: '<msg-a@cassems>', graphMessageId: 'g-a' }),
    ]);

    const { runCassemsIngest } = await import('@/lib/cassems/ingest');
    await runCassemsIngest('co1', deps());

    ports.listMessages.mockResolvedValueOnce([
      mailMessage({ internetMessageId: '<msg-b@cassems>', graphMessageId: 'g-b' }),
    ]);
    await runCassemsIngest('co1', deps());

    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.oficioNumber).toBe('2479325231');
    expect(new Decimal(memory.authorizations[0]?.totalCents ?? 0).div(100).toFixed(2)).toBe('4760.00');
    expect(memory.sources).toHaveLength(2);
  });

  it('só atualiza se o parse novo for melhor: ok > parcial > falha (AC-007)', async () => {
    const { runCassemsIngest } = await import('@/lib/cassems/ingest');

    memory.authorizations.push({
      id: 'auth-seed',
      oficioNumber: '2479325231',
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
      await runCassemsIngest('co1', deps());
    }

    await ingestWith(
      'Número de autorização: 2479325231\nPaciente DOUGLAS BARBOSA FELIPE, matrícula 1\nValor total com desconto R$ 4.760,00',
      '<parcial@cassems>',
    );
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('parcial');

    await ingestWith(OFICIO_2479325231_TEXT, '<ok@cassems>');
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('ok');
    expect(memory.authorizations[0]?.totalCents).toBe(476000);

    await ingestWith('', '<downgrade@cassems>');
    expect(memory.authorizations).toHaveLength(1);
    expect(memory.authorizations[0]?.parseStatus).toBe('ok');
  });
});
