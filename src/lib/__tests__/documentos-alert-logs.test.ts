import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderPort } from '@/lib/documentos/ingest';
import type { DocumentosWhatsAppTarget } from '@/lib/documentos/alerts';

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logged.calls.push(args),
    warn: (...args: unknown[]) => logged.calls.push(args),
    error: (...args: unknown[]) => logged.calls.push(args),
    debug: (...args: unknown[]) => logged.calls.push(args),
  }),
}));

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

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async () => memory.docs),
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
      findUnique: vi.fn(async () => memory.state),
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

const COMPANY = 'co1';
const GROUP = '120363024812345678@g.us';
const FILE = 'CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED.pdf';
const CAPTION_SNIPPET = 'vence em 30 dias';
const PDF = Buffer.from('accessToken=nao-pode-vazar-refreshToken-%PDF');

function at8sp(ymd: string): Date {
  return new Date(`${ymd}T11:00:00.000Z`);
}

function seed(): void {
  memory.docs.push({
    id: 'doc-federal',
    companyId: COMPANY,
    kind: 'cnd_federal',
    fileName: FILE,
    oneDriveItemId: 'od-federal',
    validUntil: new Date('2026-10-12T00:00:00.000Z'),
    removedAt: null,
    alertedThresholds: [],
    renewalNotifiedAt: null,
  });
}

function fakePort(): DocumentosFolderPort {
  return {
    async listPdfs() {
      return [];
    },
    async downloadPdf() {
      return PDF;
    },
    async moveToArchive() {},
    // Declarada mesmo vazia: a ingestão exige a capacidade em vez de a inferir.
    async listChildren() {
      return [];
    },
  };
}

function fakeTarget(fail = false): DocumentosWhatsAppTarget {
  return {
    jid: GROUP,
    port: {
      async sendDocument() {
        if (fail) throw new Error('Evolution 500 Bearer eyJbbbbbbbbbb accessToken=leak refreshToken=leak');
        return { messageId: 'wamid-1' };
      },
    },
  };
}

function assertSafe(value: unknown, seen = new Set<unknown>()): void {
  if (value == null) return;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    throw new Error('logger recebeu Buffer');
  }
  if (typeof value === 'string') {
    expect(value).not.toContain('leak');
    expect(value).not.toContain('nao-pode-vazar');
    expect(value).not.toContain(CAPTION_SNIPPET);
    expect(value).not.toContain('eyJbbbbbbbbbb');
    expect(value).not.toMatch(/accessToken\s*[:=]\s*(?!\[redacted\])/i);
    expect(value).not.toMatch(/refreshToken\s*[:=]\s*(?!\[redacted\])/i);
    return;
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSafe(item, seen);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    expect(key).not.toMatch(/accessToken|refreshToken|caption|content/i);
    assertSafe(nested, seen);
  }
}

describe('SPEC-042 L7 — logs do alerta não carregam caption, buffer nem token', () => {
  beforeEach(() => {
    logged.calls.length = 0;
    memory.docs.length = 0;
    memory.state = null;
    vi.clearAllMocks();
    seed();
  });

  it('caminho feliz: nenhuma chamada recebe Buffer, caption, accessToken ou refreshToken', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(false) },
      at8sp('2026-09-12'),
    );

    expect(logged.calls.length).toBeGreaterThan(0);
    for (const args of logged.calls) {
      for (const arg of args) assertSafe(arg);
    }
  });

  it('caminho de erro: falha da Evolution também não vaza caption, Buffer nem token', async () => {
    const { runDocumentosAlertTick } = await import('@/lib/documentos/alerts');
    await runDocumentosAlertTick(
      COMPANY,
      { port: fakePort(), target: fakeTarget(true) },
      at8sp('2026-09-12'),
    );

    expect(logged.calls.length).toBeGreaterThan(0);
    for (const args of logged.calls) {
      for (const arg of args) assertSafe(arg);
    }
    expect(memory.state?.lastError).toBeTruthy();
    expect(memory.state?.lastError).not.toContain('leak');
    expect(memory.state?.lastError).not.toContain('eyJbbbbbbbbbb');
    expect(memory.state?.lastError).toMatch(/\[redacted\]/);
  });
});
