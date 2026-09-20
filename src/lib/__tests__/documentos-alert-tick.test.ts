import type { CompanyDocumentKind } from '@prisma/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const lock = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  acquire: vi.fn(async (): Promise<{ release: () => Promise<undefined> } | null> => ({
    release: async () => lock.release(),
  })),
}));

const evo = vi.hoisted(() => ({
  getEvolutionConfig: vi.fn(() => null),
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

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: lock.acquire,
  documentosAlertLockKey: (companyId: string) => `documentos-alert:${companyId}`,
}));

vi.mock('@/lib/whatsapp-evolution', () => ({
  getEvolutionConfig: evo.getEvolutionConfig,
  sendWhatsAppDocument: vi.fn(),
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
    // Declarada mesmo vazia: a ingestão exige a capacidade em vez de a inferir.
    async listChildren() {
      return [];
    },
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

function seedKind(
  kind: CompanyDocumentKind,
  validUntilYmd: string,
  thresholds: number[] = [],
): DocRow {
  const row: DocRow = {
    id: `doc-${kind}`,
    companyId: COMPANY,
    kind,
    fileName: `${kind}.pdf`,
    oneDriveItemId: `od-${kind}`,
    validUntil: new Date(`${validUntilYmd}T00:00:00.000Z`),
    removedAt: null,
    alertedThresholds: [...thresholds],
    renewalNotifiedAt: null,
  };
  memory.docs.push(row);
  return row;
}

describe('SPEC-042 L7 — runDocumentosAlertTick', () => {
  beforeEach(() => {
    memory.docs.length = 0;
    memory.state = null;
    vi.clearAllMocks();
    lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
    delete process.env.DOCUMENTOS_WHATSAPP_ENABLED;
    delete process.env.DOCUMENTOS_WHATSAPP_GROUP_JID;
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

  it('30 dias → 0 envios (vencimento não dispara WhatsApp); 2.º tick do mesmo dia → 0', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const downloads: string[] = [];
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const now = at8sp('2026-09-12');
    const deps = { port: fakePort(downloads), target: fakeTarget(sent) };

    const first = await runDocumentosAlertTick(COMPANY, deps, now);
    expect(first.sent).toBe(0);
    expect(downloads).toEqual([]);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
    expect(memory.state?.lastAlertDay).toBe('2026-09-12');

    const second = await runDocumentosAlertTick(COMPANY, deps, now);
    expect(second.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('-7 → 0 envios; limiar não é consumido', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-10-19'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('-3 → 0 envios', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-10-15'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('falha: Evolution no target não é chamada; lastError fica vazio', async () => {
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
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
    expect(memory.state?.lastError).toBeFalsy();
    expect(memory.state?.lastAlertDay).toBe('2026-09-12');
  });

  it('lock ocupado → 0 envios, sem erro', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    lock.acquire.mockResolvedValueOnce(null);
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );

    expect(result.sent).toBe(0);
    expect(result.markedDay).toBe(false);
    expect(sent).toHaveLength(0);
    expect(lock.release).not.toHaveBeenCalled();
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('dois ticks concorrentes: lock só concede uma vez → 0 envios', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    let granted = 0;
    lock.acquire.mockImplementation(async () => {
      granted += 1;
      if (granted > 1) return null;
      return { release: async () => lock.release() };
    });
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const now = at8sp('2026-09-12');
    const deps = { port: fakePort(), target: fakeTarget(sent) };

    const [a, b] = await Promise.all([
      runDocumentosAlertTick(COMPANY, deps, now),
      runDocumentosAlertTick(COMPANY, deps, now),
    ]);

    expect(a.sent + b.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(lock.acquire).toHaveBeenCalledWith('documentos-alert:co1');
  });

  it('tipo sem certidão não gera envio no tick de vencimento', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedFederal('2026-10-12');
    seedKind('crf_fgts', '2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
  });

  it('canal desligado não chama getEvolutionConfig', async () => {
    const { resolveDocumentosWhatsAppTarget } = await import('@/lib/documentos/alerts');
    evo.getEvolutionConfig.mockClear();
    expect(resolveDocumentosWhatsAppTarget()).toBeNull();
    expect(evo.getEvolutionConfig).not.toHaveBeenCalled();
  });

  it('AFE nunca alerta', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedKind('afe_anvisa', '2026-10-12');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('sanitária no limiar 90/60 não envia WhatsApp', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    seedKind('licenca_sanitaria', '2026-12-11');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const at90 = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );
    expect(at90.sent).toBe(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
    expect(sent).toHaveLength(0);

    memory.state!.lastAlertDay = null;
    const at60 = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-10-12'),
    );
    expect(at60.sent).toBe(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('carta sem data não alerta', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    memory.docs.push({
      id: 'doc-carta',
      companyId: COMPANY,
      kind: 'carta_comercializacao',
      fileName: 'Carta Comercialização TECHIMPORT.pdf',
      oneDriveItemId: 'od-carta',
      validUntil: null,
      removedAt: null,
      alertedThresholds: [],
      renewalNotifiedAt: null,
    });
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(sent) },
      at8sp('2026-09-12'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
  });

  it('carta vencida há anos não dispara PDF no grupo', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    memory.docs.push({
      id: 'doc-carta-velha',
      companyId: COMPANY,
      kind: 'carta_comercializacao',
      fileName: 'Carta Comercialização TECHIMPORT.pdf',
      oneDriveItemId: 'od-carta-velha',
      validUntil: new Date('1925-10-01T00:00:00.000Z'),
      removedAt: null,
      alertedThresholds: [],
      renewalNotifiedAt: null,
    });
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const downloads: string[] = [];

    const result = await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(downloads), target: fakeTarget(sent) },
      at8sp('2026-09-14'),
    );

    expect(result.sent).toBe(0);
    expect(sent).toHaveLength(0);
    expect(downloads).toHaveLength(0);
  });
});

describe('hora do alerta é configurável — para poder homologar', () => {
  /**
   * Com a hora fixa em 8, provar que o alerta chega de facto exigia esperar
   * até às 8 da manhã seguinte, e o portão L7-G7 ficou aberto por isso.
   *
   * O fallback é deliberadamente SEGURO: variável inválida cai no padrão em vez
   * de desligar o alerta. Uma variável mal escrita não pode silenciar avisos de
   * vencimento sem ninguém dar por isso.
   */
  const guardado = process.env.DOCUMENTOS_ALERT_HOUR_LOCAL;
  afterEach(() => {
    if (guardado === undefined) delete process.env.DOCUMENTOS_ALERT_HOUR_LOCAL;
    else process.env.DOCUMENTOS_ALERT_HOUR_LOCAL = guardado;
  });

  it('sem variável, mantém as 8', async () => {
    delete process.env.DOCUMENTOS_ALERT_HOUR_LOCAL;
    const { documentosAlertHourLocal } = await import('@/lib/documentos/constants');
    expect(documentosAlertHourLocal()).toBe(8);
  });

  it('respeita a hora configurada', async () => {
    process.env.DOCUMENTOS_ALERT_HOUR_LOCAL = '15';
    const { documentosAlertHourLocal } = await import('@/lib/documentos/constants');
    expect(documentosAlertHourLocal()).toBe(15);
  });

  it('valor inválido cai no padrão, nunca desliga o alerta', async () => {
    const { documentosAlertHourLocal } = await import('@/lib/documentos/constants');
    for (const mau of ['abc', '-1', '24', '8.5', '']) {
      process.env.DOCUMENTOS_ALERT_HOUR_LOCAL = mau;
      expect(documentosAlertHourLocal(), `valor ${JSON.stringify(mau)}`).toBe(8);
    }
  });
});
