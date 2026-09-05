import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderFile, DocumentosFolderPort } from '@/lib/documentos/ingest';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT } from '@/lib/documentos/constants';
import { selectVigente } from '@/lib/documentos/validity';

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
};

type IngestStateRow = {
  companyId: string;
  lastSuccessAt: Date | null;
  lastError: string | null;
  lastErrorAt: Date | null;
};

const memory = vi.hoisted(() => {
  function pick<T extends object>(row: T, select: Record<string, boolean>): Partial<T> {
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

const logged = vi.hoisted(() => ({ info: [] as unknown[][], warn: [] as unknown[][] }));

const lock = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  acquire: vi.fn(async (): Promise<{ release: () => Promise<undefined> } | null> => ({
    release: async () => lock.release(),
  })),
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logged.info.push(args),
    warn: (...args: unknown[]) => logged.warn.push(args),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const rows = memory.docs.filter((row) => memory.matchWhere(row, where));
        if (!select) return rows;
        return rows.map((row) => memory.pick(row, select));
      }),
      create: vi.fn(async ({ data, select }: { data: Omit<DocRow, 'id' | 'renewalNotifiedAt'>; select?: Record<string, boolean> }) => {
        const row: DocRow = {
          ...data,
          id: `doc-${memory.seq++}`,
          renewalNotifiedAt: null,
        };
        memory.docs.push(row);
        return select ? memory.pick(row, select) : row;
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
        return select ? memory.pick(row, select) : row;
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
          };
          memory.ingest.push(row);
        } else {
          Object.assign(row, update);
        }
        return row;
      }),
    },
  },
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: lock.acquire,
  documentosIngestLockKey: (companyId: string) => `documentos-ingest:${companyId}`,
}));

function resetMemory() {
  memory.docs.length = 0;
  memory.ingest.length = 0;
  memory.seq = 1;
  logged.info.length = 0;
  logged.warn.length = 0;
}

const NOW = new Date('2026-09-04T15:00:00.000Z');
const COMPANY = 'co1';

const FEDERAL_EXPIRED: DocumentosFolderFile = {
  itemId: 'od-federal-expired',
  name: 'CERTIDAO RECEITA FEDERAL 13.05.26 - QL MED.pdf',
  size: 1000,
  lastModifiedAt: new Date('2026-05-13T12:00:00.000Z'),
};
const FEDERAL_VIGENTE: DocumentosFolderFile = {
  itemId: 'od-federal-vigente',
  name: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
  size: 1100,
  lastModifiedAt: new Date('2026-09-01T12:00:00.000Z'),
};

function fakePort(
  files: DocumentosFolderFile[],
  opts: { archived?: string[]; archiveError?: Error } = {},
): DocumentosFolderPort {
  return {
    async listPdfs(folderName: string) {
      return folderName === 'Federais' ? files : [];
    },
    async downloadPdf() {
      return Buffer.from('%PDF-1.4 fixture-nao-logar');
    },
    async moveToArchive(itemId: string) {
      if (opts.archiveError) throw opts.archiveError;
      opts.archived?.push(itemId);
    },
  };
}

describe('SPEC-042 L8 — arquivar certidão vencida na pasta Vencidas', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
  });

  it('(a)(b)(d)(e) vencida com substituto posterior é movida; log tem kind e nome; nada é apagado', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    const result = await runDocumentosIngest(
      COMPANY,
      fakePort([FEDERAL_EXPIRED, FEDERAL_VIGENTE], { archived }),
      NOW,
    );

    expect(result.arquivados).toBe(1);
    expect(archived).toEqual(['od-federal-expired']);
    expect(archived).not.toContain('od-federal-vigente');
    expect(memory.docs.every((row) => row.removedAt == null)).toBe(true);

    const archiveLogs = logged.info.filter((args) => args.includes('documentos_archived'));
    expect(archiveLogs).toHaveLength(1);
    expect(archiveLogs[0]?.[0]).toEqual({
      kind: 'cnd_federal',
      fileName: FEDERAL_EXPIRED.name,
    });
  });

  it('(b) vencida sem substituto permanece; moveToArchive não é chamado', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    const result = await runDocumentosIngest(COMPANY, fakePort([FEDERAL_EXPIRED], { archived }), NOW);

    expect(result.arquivados).toBe(0);
    expect(archived).toEqual([]);
    expect(memory.docs).toHaveLength(1);
    expect(memory.docs[0]?.removedAt).toBeNull();
    expect(memory.docs[0]?.kind).toBe('cnd_federal');
  });

  it('(a) vence hoje não arquiva; (c) validUntil nulo não arquiva mesmo com substituto', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    const venceHoje: DocumentosFolderFile = {
      itemId: 'od-federal-hoje',
      name: 'CERTIDAO RECEITA FEDERAL 04.09.26 - QL MED.pdf',
      size: 900,
      lastModifiedAt: NOW,
    };
    const semData: DocumentosFolderFile = {
      itemId: 'od-federal-sem-data',
      name: 'CERTIDAO RECEITA FEDERAL sem-ano.pdf',
      size: 800,
      lastModifiedAt: NOW,
    };
    const result = await runDocumentosIngest(
      COMPANY,
      fakePort([venceHoje, semData, FEDERAL_VIGENTE], { archived }),
      NOW,
    );

    expect(result.arquivados).toBe(0);
    expect(archived).toEqual([]);
  });

  it("(c) validUntilSource 'manual' sem substituto não arquiva", async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    memory.docs.push({
      id: 'doc-manual',
      companyId: COMPANY,
      kind: 'cnd_federal',
      fileName: FEDERAL_EXPIRED.name,
      oneDriveItemId: FEDERAL_EXPIRED.itemId,
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      folderName: 'Federais',
      fileSize: 1000,
      lastModifiedAt: FEDERAL_EXPIRED.lastModifiedAt,
      validUntil: new Date('2026-05-13T00:00:00.000Z'),
      validUntilSource: 'manual',
      removedAt: null,
      renewalNotifiedAt: null,
    });
    const archived: string[] = [];
    const result = await runDocumentosIngest(COMPANY, fakePort([FEDERAL_EXPIRED], { archived }), NOW);

    expect(result.arquivados).toBe(0);
    expect(archived).toEqual([]);
    expect(memory.docs[0]?.validUntilSource).toBe('manual');
    expect(memory.docs[0]?.removedAt).toBeNull();
  });

  it('pasta Vencidas ausente: fail-closed, arquivados 0, ingestão não falha', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    const result = await runDocumentosIngest(
      COMPANY,
      fakePort([FEDERAL_EXPIRED, FEDERAL_VIGENTE], {
        archived,
        archiveError: new Error('pasta Vencidas não encontrada'),
      }),
      NOW,
    );

    expect(result.arquivados).toBe(0);
    expect(archived).toEqual([]);
    expect(result.upserted).toBe(2);
    expect(logged.warn.some((args) => args.includes('documentos_archive_failed'))).toBe(true);
  });

  it('(f) item movido some na varredura seguinte, recebe removedAt e não é vigente', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    await runDocumentosIngest(
      COMPANY,
      fakePort([FEDERAL_EXPIRED, FEDERAL_VIGENTE], { archived }),
      NOW,
    );
    expect(archived).toEqual(['od-federal-expired']);

    const goneAt = new Date('2026-09-04T16:00:00.000Z');
    const second = await runDocumentosIngest(COMPANY, fakePort([FEDERAL_VIGENTE], { archived }), goneAt);

    expect(second.removed).toBe(1);
    const moved = memory.docs.find((row) => row.oneDriveItemId === FEDERAL_EXPIRED.itemId);
    const kept = memory.docs.find((row) => row.oneDriveItemId === FEDERAL_VIGENTE.itemId);
    expect(moved?.removedAt).toEqual(goneAt);
    expect(kept?.removedAt).toBeNull();

    const vigente = selectVigente(memory.docs);
    expect(vigente.get('cnd_federal')?.oneDriveItemId).toBe(FEDERAL_VIGENTE.itemId);
    expect(vigente.get('cnd_federal')?.id).toBe(kept?.id);
  });
});
