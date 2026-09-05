import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderFile, DocumentosFolderPort } from '@/lib/documentos/ingest';
import type { DocumentosWhatsAppTarget } from '@/lib/documentos/alerts';

type DocRow = {
  id: string;
  companyId: string;
  kind: CompanyDocumentKind;
  fileName: string;
  oneDriveItemId: string;
  oneDriveAccount: string;
  folderName: string;
  fileSize: number | null;
  lastModifiedAt: Date | null;
  validUntil: Date | null;
  validUntilSource: string | null;
  removedAt: Date | null;
  renewalNotifiedAt: Date | null;
  alertedThresholds: number[];
};

type IngestStateRow = {
  companyId: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
  lastAlertDay: string | null;
};

const memory = vi.hoisted(() => {
  function pick<T extends object>(row: T, select?: Record<string, boolean>): Partial<T> | T {
    if (!select) return row;
    const out: Partial<T> = {};
    for (const key of Object.keys(select) as (keyof T)[]) {
      if (select[key as string]) out[key] = row[key];
    }
    return out;
  }

  function matchWhere(row: DocRow, where?: Record<string, unknown>): boolean {
    if (!where) return true;
    for (const [key, value] of Object.entries(where)) {
      const current = row[key as keyof DocRow];
      if (value === null) {
        if (current != null) return false;
        continue;
      }
      if (value && typeof value === 'object' && 'notIn' in (value as object)) {
        const excluded = (value as { notIn: string[] }).notIn;
        if (excluded.includes(current as string)) return false;
        continue;
      }
      if (current !== value) return false;
    }
    return true;
  }

  return {
    docs: [] as DocRow[],
    ingest: [] as IngestStateRow[],
    seq: 1,
    pick,
    matchWhere,
  };
});

const lock = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  acquire: vi.fn(async (): Promise<{ release: () => Promise<undefined> } | null> => ({
    release: async () => lock.release(),
  })),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const rows = memory.docs.filter((row) => memory.matchWhere(row, where));
        return rows.map((row) => memory.pick(row, select));
      }),
      findUnique: vi.fn(async ({ where, select }: { where: { id: string }; select?: Record<string, boolean> }) => {
        const row = memory.docs.find((item) => item.id === where.id);
        if (!row) return null;
        return memory.pick(row, select);
      }),
      create: vi.fn(async ({ data, select }: { data: Omit<DocRow, 'id' | 'renewalNotifiedAt' | 'alertedThresholds'>; select?: Record<string, boolean> }) => {
        const row: DocRow = {
          ...data,
          id: `doc-${memory.seq++}`,
          renewalNotifiedAt: null,
          alertedThresholds: [],
        };
        memory.docs.push(row);
        return memory.pick(row, select);
      }),
      update: vi.fn(async ({
        where,
        data,
        select,
      }: {
        where: { id: string };
        data: Partial<DocRow>;
        select?: Record<string, boolean>;
      }) => {
        const row = memory.docs.find((item) => item.id === where.id);
        if (!row) throw new Error('document missing');
        Object.assign(row, data);
        return memory.pick(row, select);
      }),
      updateMany: vi.fn(async ({ where, data }: { where?: Record<string, unknown>; data: Partial<DocRow> }) => {
        let count = 0;
        for (const row of memory.docs) {
          if (!memory.matchWhere(row, where)) continue;
          Object.assign(row, data);
          count += 1;
        }
        return { count };
      }),
    },
    companyDocumentIngestState: {
      upsert: vi.fn(async ({
        where,
        create,
        update,
      }: {
        where: { companyId: string };
        create: IngestStateRow;
        update: Partial<IngestStateRow>;
      }) => {
        let row = memory.ingest.find((item) => item.companyId === where.companyId);
        if (!row) {
          row = {
            companyId: create.companyId,
            lastSuccessAt: create.lastSuccessAt ?? null,
            lastError: create.lastError ?? null,
            lastErrorAt: create.lastErrorAt ?? null,
            lastAlertDay: create.lastAlertDay ?? null,
          };
          memory.ingest.push(row);
        } else {
          Object.assign(row, update);
        }
        return row;
      }),
      findUnique: vi.fn(async ({ where }: { where: { companyId: string } }) =>
        memory.ingest.find((item) => item.companyId === where.companyId) ?? null,
      ),
    },
  },
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: lock.acquire,
  documentosIngestLockKey: (companyId: string) => `documentos-ingest:${companyId}`,
  documentosAlertLockKey: (companyId: string) => `documentos-alert:${companyId}`,
}));

vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: vi.fn(async () => {
    throw new Error('porta OneDrive não injetada no teste');
  }),
}));

const COMPANY = 'co1';
const NOW = new Date('2026-09-04T15:00:00.000Z');
const GROUP = '120363024812345678@g.us';
const PDF = Buffer.from('%PDF-1.4 renovacao');

const OLD: DocumentosFolderFile = {
  itemId: 'od-estadual-old',
  name: 'CERTIDAO ESTADUAL 12.10.26 QL MED.pdf',
  size: 1024,
  lastModifiedAt: new Date('2026-08-01T12:00:00.000Z'),
};
const NEW: DocumentosFolderFile = {
  itemId: 'od-estadual-new',
  name: 'CERTIDAO ESTADUAL 12.12.26 QL MED.pdf',
  size: 2048,
  lastModifiedAt: new Date('2026-09-04T18:00:00.000Z'),
};

function fakePort(files: DocumentosFolderFile[]): DocumentosFolderPort {
  return {
    async listPdfs(folderPath: string) {
      const key = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
      return key === 'Estaduais' ? files : [];
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

function fakeTarget(
  sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }>,
): DocumentosWhatsAppTarget {
  return {
    jid: GROUP,
    port: {
      async sendDocument(input) {
        const row = memory.docs.find((item) => item.fileName === input.fileName);
        if (row?.renewalNotifiedAt == null) {
          throw new Error('renewalNotifiedAt still null at send time');
        }
        sent.push(input);
        return { messageId: 'wamid-1' };
      },
    },
  };
}

describe('SPEC-042 L7 — notifyRenewals (FR-011 / AC-008)', () => {
  beforeEach(() => {
    memory.docs.length = 0;
    memory.ingest.length = 0;
    memory.seq = 1;
    vi.clearAllMocks();
    lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
  });

  it('vigente 2026-10-12 substituído por 2026-12-12 → 1 envio e renewalNotifiedAt gravado', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const target = fakeTarget(sent);

    await runDocumentosIngest(COMPANY, fakePort([OLD]), NOW, { target });
    expect(sent).toHaveLength(0);

    const second = await runDocumentosIngest(COMPANY, fakePort([OLD, NEW]), NOW, { target });
    expect(second.renewals).toHaveLength(1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.fileName).toBe(NEW.name);
    expect(sent[0]?.content.equals(PDF)).toBe(true);
    expect(sent[0]?.caption).toContain('renovada — válida até 12/12/2026');

    const created = memory.docs.find((row) => row.oneDriveItemId === NEW.itemId);
    expect(created?.renewalNotifiedAt).toBeInstanceOf(Date);
  });

  it('reexecução → 0 envios', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];
    const target = fakeTarget(sent);

    await runDocumentosIngest(COMPANY, fakePort([OLD]), NOW, { target });
    await runDocumentosIngest(COMPANY, fakePort([OLD, NEW]), NOW, { target });
    expect(sent).toHaveLength(1);

    const third = await runDocumentosIngest(COMPANY, fakePort([OLD, NEW]), NOW, { target });
    expect(third.renewals).toHaveLength(0);
    expect(sent).toHaveLength(1);
  });

  it('primeira carga (sem vigente anterior) → 0 envios', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const sent: Array<{ jid: string; fileName: string; content: Buffer; caption: string }> = [];

    const first = await runDocumentosIngest(COMPANY, fakePort([NEW]), NOW, { target: fakeTarget(sent) });
    expect(first.renewals).toHaveLength(0);
    expect(sent).toHaveLength(0);
    expect(memory.docs[0]?.renewalNotifiedAt).toBeNull();
  });
});
