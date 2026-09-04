import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CERTIDAO_LABEL } from '@/lib/documentos/constants';
import type { DocumentosFolderPort } from '@/lib/documentos/ingest';
import type { DocumentosWhatsAppTarget } from '@/lib/documentos/alerts';

type DocRow = {
  id: string;
  companyId: string;
  kind: CompanyDocumentKind;
  fileName: string;
  oneDriveItemId: string;
  validUntil: Date | null;
  removedAt: Date | null;
  alertedThresholds: number[];
  renewalNotifiedAt: Date | null;
};

type StateRow = {
  companyId: string;
  lastAlertDay: string | null;
  lastError: string | null;
  lastErrorAt: Date | null;
};

const memory = vi.hoisted(() => ({
  docs: [] as DocRow[],
  state: null as StateRow | null,
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({ where }: { where?: { companyId?: string; removedAt?: null } }) =>
        memory.docs.filter((row) => {
          if (where?.companyId && row.companyId !== where.companyId) return false;
          if (where && 'removedAt' in where && where.removedAt === null && row.removedAt != null) return false;
          return true;
        }),
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        memory.docs.find((row) => row.id === where.id) ?? null,
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
        const row = memory.docs.find((item) => item.id === where.id);
        if (!row) throw new Error('document missing');
        Object.assign(row, data);
        return row;
      }),
    },
    companyDocumentIngestState: {
      findUnique: vi.fn(async ({ where }: { where: { companyId: string } }) =>
        memory.state?.companyId === where.companyId ? memory.state : null,
      ),
      upsert: vi.fn(async ({
        where,
        create,
        update,
      }: {
        where: { companyId: string };
        create: Partial<StateRow> & { companyId: string };
        update: Partial<StateRow>;
      }) => {
        if (!memory.state || memory.state.companyId !== where.companyId) {
          memory.state = {
            companyId: create.companyId,
            lastAlertDay: create.lastAlertDay ?? null,
            lastError: create.lastError ?? null,
            lastErrorAt: create.lastErrorAt ?? null,
          };
        } else {
          Object.assign(memory.state, update);
        }
        return memory.state;
      }),
    },
  },
}));

vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: vi.fn(async () => {
    throw new Error('porta OneDrive não injetada no teste');
  }),
}));

const COMPANY = 'co1';
const GROUP = '120363024812345678@g.us';
const PDF = Buffer.from('%PDF-1.4 certidao-fixture');
const FEDERAL_FILE = 'CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED.pdf';

/** 08:00 America/Sao_Paulo (UTC-3, sem DST). */
function at8sp(ymd: string): Date {
  return new Date(`${ymd}T11:00:00.000Z`);
}

function seedFederal(validUntilYmd: string, thresholds: number[] = []): DocRow {
  const row: DocRow = {
    id: 'doc-federal',
    companyId: COMPANY,
    kind: 'cnd_federal',
    fileName: FEDERAL_FILE,
    oneDriveItemId: 'od-federal',
    validUntil: new Date(`${validUntilYmd}T00:00:00.000Z`),
    removedAt: null,
    alertedThresholds: [...thresholds],
    renewalNotifiedAt: null,
  };
  memory.docs.push(row);
  return row;
}

function fakePort(calls: string[] = []): DocumentosFolderPort {
  return {
    async listPdfs() {
      return [];
    },
    async downloadPdf(itemId: string) {
      calls.push(itemId);
      return PDF;
    },
    async moveToArchive() {},
  };
}

function fakeTarget(
  sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }>,
  failWith?: Error,
): DocumentosWhatsAppTarget {
  return {
    jid: GROUP,
    port: {
      async sendDocument(input) {
        sent.push(input);
        if (failWith) throw failWith;
        return { messageId: 'wamid-1' };
      },
    },
  };
}

describe('SPEC-042 L7 — runDocumentosAlertTick', () => {
  beforeEach(() => {
    memory.docs.length = 0;
    memory.state = null;
    vi.clearAllMocks();
  });

  it('lastAlertDay=hoje → 0 envios sem tocar em nada', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    memory.state = { companyId: COMPANY, lastAlertDay: '2026-09-12', lastError: null, lastErrorAt: null };
    const downloads: string[] = [];
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(downloads), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(downloads).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
    expect(memory.state?.lastAlertDay).toBe('2026-09-12');
  });

  it('25 dias → 0 envios', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    // 25 não é limiar; o 30 já foi consumido. thresholdDue(25, [30]) === null
    // (catch-up de 30 só ocorre se o job tiver falhado no dia 30).
    seedFederal('2026-10-12', [30]);
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-17'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([30]);
  });

  it('30 dias → 1 envio com PDF, legenda e tipos em falta; 2.º tick do mesmo dia → 0', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const downloads: string[] = [];
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const now = at8sp('2026-09-12');
    const deps = { port: fakePort(downloads), target: fakeTarget(sent) };

    const first = await runDocumentosAlertTick(COMPANY, deps, now);
    expect(first.sent).toBe(1);
    expect(downloads).toEqual(['od-federal']);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.jid).toBe(GROUP);
    expect(sent[0]?.content.equals(PDF)).toBe(true);
    expect(sent[0]?.fileName).toBe(FEDERAL_FILE);
    expect(sent[0]?.caption).toContain(CERTIDAO_LABEL.cnd_federal);
    expect(sent[0]?.caption).toContain(FEDERAL_FILE);
    expect(sent[0]?.caption).toContain('vence em 30 dias');
    expect(sent[0]?.caption).toContain(`Sem certidão no OneDrive: ${CERTIDAO_LABEL.crf_fgts}`);
    expect(sent[0]?.caption).toContain(`Sem certidão no OneDrive: ${CERTIDAO_LABEL.cndt}`);
    expect(memory.docs[0]?.alertedThresholds).toEqual([30]);
    expect(memory.state?.lastAlertDay).toBe('2026-09-12');

    const second = await runDocumentosAlertTick(COMPANY, deps, now);
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
  });

  it('-7 → 1 envio vencida há 7 dias', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-10-19'),
    );

    expect(result.sent).toBe(1);
    expect(sent[0]?.caption).toContain('vencida há 7 dias');
    expect(memory.docs[0]?.alertedThresholds).toEqual([-7]);
  });

  it('-3 → limiar -7', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-10-15'),
    );

    expect(result.sent).toBe(1);
    expect(memory.docs[0]?.alertedThresholds).toEqual([-7]);
    expect(sent[0]?.caption).toContain('vencida há 3 dias');
  });

  it('falha: Evolution rejeita, limiar já gravado, erro saneado, tick seguinte não reenvia', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const boom = new Error('Evolution 500 Bearer eyJaaaaaaaaaaa secret-token');
    const now = at8sp('2026-09-12');

    const first = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent, boom) },
      now,
    );

    expect(first.sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(memory.docs[0]?.alertedThresholds).toEqual([30]);
    expect(memory.state?.lastError).toBeTruthy();
    expect(memory.state?.lastError).toMatch(/Bearer \[redacted\]/);
    expect(memory.state?.lastError).not.toMatch(/eyJaaaaaaaaaaa/);
    expect(memory.state?.lastAlertDay).toBe('2026-09-12');

    memory.state!.lastAlertDay = null;

    const second = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      now,
    );

    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(1);
    expect(memory.docs[0]?.alertedThresholds).toEqual([30]);
  });
});
