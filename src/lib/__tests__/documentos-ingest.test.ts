import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderFile, DocumentosFolderPort } from '@/lib/documentos/ingest';
import { DOCUMENTOS_ONEDRIVE_ACCOUNT } from '@/lib/documentos/constants';

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
};

type FixtureRow = {
  folder: string;
  file: string;
  kind: CompanyDocumentKind;
  validUntil: string | null;
};

/** 24 nomes reais da pasta OneDrive em 04/09/2026 (PLAN.md). */
const FIXTURE: FixtureRow[] = [
  { folder: 'Federais', file: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf', kind: 'cnd_federal', validUntil: '2026-12-12' },
  { folder: 'Federais', file: 'CERTIDAO RECEITA FEDERAL 06.07.26- QL MED.pdf', kind: 'cnd_federal', validUntil: '2026-07-06' },
  { folder: 'Federais', file: 'CERTIDÃO RECEITA FEDERAL 13.05.26 - QL MED.pdf', kind: 'cnd_federal', validUntil: '2026-05-13' },
  { folder: 'Federais', file: 'CERTIDÃO Tribunal Regional Federal da 3ª Região.pdf', kind: 'outro', validUntil: null },
  { folder: 'FGTS', file: 'CERTIDÃO FGTS 29.09.26 QL MED.pdf', kind: 'crf_fgts', validUntil: '2026-09-29' },
  { folder: 'FGTS', file: 'CERTIDÃO FGTS 03.09.26 QL MED.pdf', kind: 'crf_fgts', validUntil: '2026-09-03' },
  { folder: 'FGTS', file: 'CERTIDÃO FGTS 09.08.26 QL MED.pdf', kind: 'crf_fgts', validUntil: '2026-08-09' },
  { folder: 'FGTS', file: 'CERTIDÃO FGTS 16.07.26 QL MED.pdf', kind: 'crf_fgts', validUntil: '2026-07-16' },
  { folder: 'Débitos Trabalhistas', file: 'CERTIDÃO DEBITOS TRABALHISTA 03.10.26.pdf', kind: 'cndt', validUntil: '2026-10-03' },
  { folder: 'Débitos Trabalhistas', file: 'CERTIDÃO DEBITOS TRABALHISTA 15.04.26.pdf', kind: 'cndt', validUntil: '2026-04-15' },
  { folder: 'Estaduais', file: 'CERTIDAO ESTADUAL 12.10.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-10-12' },
  { folder: 'Estaduais', file: 'CERTIDAO ESTADUAL 20.09.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-09-20' },
  { folder: 'Estaduais', file: 'CERTIDAO ESTADUAL 01.08.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-08-01' },
  { folder: 'Estaduais', file: 'CERTIDAO ESTADUAL 26.06.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-06-26' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL 18.05.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-05-18' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL 12.04.26 QL MED.pdf', kind: 'cnd_estadual_ms', validUntil: '2026-04-12' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf', kind: 'cnd_estadual_mt', validUntil: '2026-08-13' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 06.07.26.pdf', kind: 'cnd_estadual_mt', validUntil: '2026-07-06' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 04.06.26.pdf', kind: 'cnd_estadual_mt', validUntil: '2026-06-04' },
  { folder: 'Estaduais', file: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.02.26.pdf', kind: 'cnd_estadual_mt', validUntil: '2026-02-08' },
  { folder: 'Municipais', file: 'certidão débitos gerais val. 01-10-2026.pdf'.normalize('NFD'), kind: 'cnd_municipal_gerais', validUntil: '2026-10-01' },
  { folder: 'Municipais', file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 30.09.26.pdf', kind: 'cnd_municipal_mobiliario', validUntil: '2026-09-30' },
  { folder: 'Municipais', file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 02.09.26.pdf', kind: 'cnd_municipal_mobiliario', validUntil: '2026-09-02' },
  { folder: 'Municipais', file: 'CERTIDAO NEGATIVA DE DEBITOS MOBILIARIO 05.04.pdf', kind: 'cnd_municipal_mobiliario', validUntil: null },
];

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
    connection: { id: 'conn-1', driveId: 'drive-1' } as { id: string; driveId: string } | null,
    seq: 1,
    creates: 0,
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

const uploadOd = vi.hoisted(() => ({
  uploadOneDriveFile: vi.fn(async () => ({ id: 'item-up', name: 'up.pdf' })),
  ensureToken: vi.fn(async () => 'token'),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({ where, select }: { where?: Record<string, unknown>; select?: Record<string, boolean> }) => {
        const rows = memory.docs.filter((row) => memory.matchWhere(row, where));
        if (!select) return rows;
        return rows.map((row) => memory.pick(row, select));
      }),
      create: vi.fn(async ({ data, select }: { data: Omit<DocRow, 'id' | 'renewalNotifiedAt' | 'alertedThresholds'>; select?: Record<string, boolean> }) => {
        memory.creates += 1;
        const row: DocRow = {
          ...data,
          id: `doc-${memory.seq++}`,
          renewalNotifiedAt: null,
          alertedThresholds: [],
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
    oneDriveConnection: {
      findFirst: vi.fn(async () => memory.connection),
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
  documentosAlertLockKey: (companyId: string) => `documentos-alert:${companyId}`,
}));

vi.mock('@/lib/onedrive-client', () => ({
  uploadOneDriveFile: uploadOd.uploadOneDriveFile,
}));

vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: uploadOd.ensureToken,
}));

function resetMemory() {
  memory.docs.length = 0;
  memory.ingest.length = 0;
  memory.connection = { id: 'conn-1', driveId: 'drive-1' };
  memory.seq = 1;
  memory.creates = 0;
}

function itemIdFor(index: number): string {
  return `od-${index}`;
}

function filesFromFixture(rows: FixtureRow[] = FIXTURE): { folder: string; file: DocumentosFolderFile }[] {
  return rows.map((row, index) => ({
    folder: row.folder,
    file: {
      itemId: itemIdFor(index),
      name: row.file,
      size: 1024 + index,
      lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
    },
  }));
}

function fakePort(entries: { folder: string; file: DocumentosFolderFile }[]): DocumentosFolderPort {
  return {
    async listPdfs(folderName: string) {
      return entries.filter((entry) => entry.folder === folderName).map((entry) => entry.file);
    },
    async downloadPdf() {
      return Buffer.from('%PDF-1.4 fixture-nao-logar');
    },
    async moveToArchive() {},
  };
}

function ymd(value: Date | string | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

const NOW = new Date('2026-09-04T15:00:00.000Z');
const COMPANY = 'co1';

describe('SPEC-042 L4 — runDocumentosIngest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
  });

  it('24 itens da fixture → 24 linhas; segunda passada → 0 creates', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const entries = filesFromFixture();
    const port = fakePort(entries);

    const first = await runDocumentosIngest(COMPANY, port, NOW);

    expect(FIXTURE).toHaveLength(24);
    expect(first.scanned).toBe(24);
    expect(first.upserted).toBe(24);
    expect(first.removed).toBe(0);
    expect(first.renewals).toHaveLength(0);
    expect(memory.docs).toHaveLength(24);
    expect(memory.creates).toBe(24);
    expect(lock.acquire).toHaveBeenCalledWith('documentos-ingest:co1');
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(memory.ingest[0]?.lastSuccessAt).toEqual(NOW);
    expect(memory.ingest[0]?.lastError).toBeNull();

    for (const [index, fixture] of FIXTURE.entries()) {
      const row = memory.docs.find((item) => item.oneDriveItemId === itemIdFor(index));
      expect(row, fixture.file).toBeDefined();
      expect(row?.kind).toBe(fixture.kind);
      expect(row?.folderName).toBe(fixture.folder);
      expect(row?.fileName).toBe(fixture.file);
      expect(ymd(row?.validUntil ?? null)).toBe(fixture.validUntil);
      expect(row?.validUntilSource).toBe(fixture.validUntil ? 'filename' : null);
      expect(row?.oneDriveAccount).toBe(DOCUMENTOS_ONEDRIVE_ACCOUNT);
      expect(row?.removedAt).toBeNull();
    }

    const second = await runDocumentosIngest(COMPANY, port, NOW);
    expect(second.scanned).toBe(24);
    expect(second.removed).toBe(0);
    expect(memory.docs).toHaveLength(24);
    expect(memory.creates).toBe(24);
    expect(new Set(memory.docs.map((row) => row.id)).size).toBe(24);
  });

  it('item ausente recebe removedAt; reaparecer zera removedAt', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const entries = filesFromFixture();
    await runDocumentosIngest(COMPANY, fakePort(entries), NOW);

    const missing = entries[0];
    const remaining = entries.slice(1);
    const goneAt = new Date('2026-09-04T16:00:00.000Z');
    const result = await runDocumentosIngest(COMPANY, fakePort(remaining), goneAt);

    expect(result.removed).toBe(1);
    const gone = memory.docs.find((row) => row.oneDriveItemId === missing.file.itemId);
    expect(gone?.removedAt).toEqual(goneAt);
    expect(memory.docs.filter((row) => row.removedAt == null)).toHaveLength(23);

    const back = new Date('2026-09-04T17:00:00.000Z');
    await runDocumentosIngest(COMPANY, fakePort(entries), back);
    expect(gone?.removedAt).toBeNull();
  });

  it('renomeado (mesmo itemId) atualiza o nome na mesma linha', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const entries = filesFromFixture();
    await runDocumentosIngest(COMPANY, fakePort(entries), NOW);
    const originalId = memory.docs.find((row) => row.oneDriveItemId === 'od-0')?.id;

    entries[0] = {
      ...entries[0],
      file: { ...entries[0].file, name: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED (copia).pdf' },
    };
    await runDocumentosIngest(COMPANY, fakePort(entries), NOW);

    const renamed = memory.docs.find((row) => row.oneDriveItemId === 'od-0');
    expect(renamed?.id).toBe(originalId);
    expect(renamed?.fileName).toBe('CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED (copia).pdf');
    expect(memory.docs).toHaveLength(24);
    expect(memory.creates).toBe(24);
  });

  it("validUntilSource 'manual' nunca é sobrescrito pela ingestão", async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const entries = filesFromFixture();
    await runDocumentosIngest(COMPANY, fakePort(entries), NOW);

    const row = memory.docs.find((item) => item.oneDriveItemId === 'od-0');
    expect(row).toBeDefined();
    const manualDate = new Date('2025-01-15T00:00:00.000Z');
    row!.validUntilSource = 'manual';
    row!.validUntil = manualDate;

    entries[0] = {
      ...entries[0],
      file: { ...entries[0].file, name: 'CERTIDAO RECEITA FEDERAL 01.01.27 - QL MED.pdf' },
    };
    await runDocumentosIngest(COMPANY, fakePort(entries), NOW);

    expect(row!.validUntilSource).toBe('manual');
    expect(row!.validUntil).toEqual(manualDate);
    expect(row!.fileName).toBe('CERTIDAO RECEITA FEDERAL 01.01.27 - QL MED.pdf');
  });

  it('primeira carga não gera RenewalEvent; vigente 2026-10-12 substituído por 2026-12-12 gera 1', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const entries = filesFromFixture();
    const first = await runDocumentosIngest(COMPANY, fakePort(entries), NOW);
    expect(first.renewals).toHaveLength(0);

    const renewalFile: DocumentosFolderFile = {
      itemId: 'od-estadual-nova',
      name: 'CERTIDAO ESTADUAL 12.12.26 QL MED.pdf',
      size: 2048,
      lastModifiedAt: new Date('2026-09-04T18:00:00.000Z'),
    };
    const withRenewal = [...entries, { folder: 'Estaduais', file: renewalFile }];
    const second = await runDocumentosIngest(COMPANY, fakePort(withRenewal), NOW);

    expect(second.renewals).toHaveLength(1);
    expect(second.renewals[0]).toEqual({
      companyId: COMPANY,
      kind: 'cnd_estadual_ms',
      documentId: expect.any(String),
      previousValidUntil: '2026-10-12',
      validUntil: '2026-12-12',
    });
    const created = memory.docs.find((row) => row.oneDriveItemId === 'od-estadual-nova');
    expect(created?.id).toBe(second.renewals[0]?.documentId);
    expect(created?.kind).toBe('cnd_estadual_ms');
  });

  it('lock ocupado lança DocumentosIngestBusyError e não grava linhas', async () => {
    const { runDocumentosIngest, DocumentosIngestBusyError } = await import('@/lib/documentos/ingest');
    lock.acquire.mockResolvedValueOnce(null);

    await expect(runDocumentosIngest(COMPANY, fakePort(filesFromFixture()), NOW)).rejects.toBeInstanceOf(
      DocumentosIngestBusyError,
    );
    expect(memory.docs).toHaveLength(0);
    expect(memory.creates).toBe(0);
    expect(lock.release).not.toHaveBeenCalled();
    expect(memory.ingest).toHaveLength(0);
  });

  it('linha existente kind outro com nome de MT é reclassificada para cnd_estadual_mt', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    memory.docs.push({
      id: 'doc-mt-legado',
      companyId: COMPANY,
      kind: 'outro',
      fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf',
      oneDriveItemId: 'od-mt-legado',
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      folderName: 'Estaduais',
      fileSize: 1024,
      lastModifiedAt: new Date('2026-08-13T00:00:00.000Z'),
      validUntil: new Date('2026-08-13T00:00:00.000Z'),
      validUntilSource: 'filename',
      removedAt: null,
      renewalNotifiedAt: null,
      alertedThresholds: [],
    });

    const result = await runDocumentosIngest(
      COMPANY,
      fakePort([
        {
          folder: 'Estaduais',
          file: {
            itemId: 'od-mt-legado',
            name: 'CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf',
            size: 1024,
            lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
          },
        },
      ]),
      NOW,
    );

    expect(result.upserted).toBe(1);
    expect(memory.creates).toBe(0);
    expect(memory.docs).toHaveLength(1);
    expect(memory.docs[0]?.id).toBe('doc-mt-legado');
    expect(memory.docs[0]?.kind).toBe('cnd_estadual_mt');
  });

  it('mesmo itemId com validade nova zera alertedThresholds e renewalNotifiedAt', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    memory.docs.push({
      id: 'doc-federal-exist',
      companyId: COMPANY,
      kind: 'cnd_federal',
      fileName: 'CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED.pdf',
      oneDriveItemId: 'od-rename',
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      folderName: 'Federais',
      fileSize: 1024,
      lastModifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      validUntil: new Date('2026-10-12T00:00:00.000Z'),
      validUntilSource: 'filename',
      removedAt: null,
      renewalNotifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      alertedThresholds: [30, 15],
    });

    await runDocumentosIngest(
      COMPANY,
      fakePort([
        {
          folder: 'Federais',
          file: {
            itemId: 'od-rename',
            name: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
            size: 1024,
            lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
          },
        },
      ]),
      NOW,
    );

    expect(ymd(memory.docs[0]?.validUntil ?? null)).toBe('2026-12-12');
    expect(memory.docs[0]?.alertedThresholds).toEqual([]);
    expect(memory.docs[0]?.renewalNotifiedAt).toBeNull();
  });

  it('mesmo itemId sem mudar validade preserva alertedThresholds e renewalNotifiedAt', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const notifiedAt = new Date('2026-08-01T00:00:00.000Z');
    memory.docs.push({
      id: 'doc-federal-exist',
      companyId: COMPANY,
      kind: 'cnd_federal',
      fileName: 'CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED.pdf',
      oneDriveItemId: 'od-rename',
      oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
      folderName: 'Federais',
      fileSize: 1024,
      lastModifiedAt: new Date('2026-08-01T00:00:00.000Z'),
      validUntil: new Date('2026-10-12T00:00:00.000Z'),
      validUntilSource: 'filename',
      removedAt: null,
      renewalNotifiedAt: notifiedAt,
      alertedThresholds: [30, 15],
    });

    await runDocumentosIngest(
      COMPANY,
      fakePort([
        {
          folder: 'Federais',
          file: {
            itemId: 'od-rename',
            name: 'CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED (copia).pdf',
            size: 2048,
            lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
          },
        },
      ]),
      NOW,
    );

    expect(memory.docs[0]?.fileName).toBe('CERTIDAO RECEITA FEDERAL 12.10.26 - QL MED (copia).pdf');
    expect(ymd(memory.docs[0]?.validUntil ?? null)).toBe('2026-10-12');
    expect(memory.docs[0]?.alertedThresholds).toEqual([30, 15]);
    expect(memory.docs[0]?.renewalNotifiedAt).toEqual(notifiedAt);
  });

  it('substituto que some nesta varredura não arquiva o vencido', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    const archived: string[] = [];
    memory.docs.push(
      {
        id: 'doc-expired',
        companyId: COMPANY,
        kind: 'cnd_federal',
        fileName: 'CERTIDAO RECEITA FEDERAL 01.08.26 - QL MED.pdf',
        oneDriveItemId: 'od-expired',
        oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
        folderName: 'Federais',
        fileSize: 1024,
        lastModifiedAt: new Date('2026-08-01T00:00:00.000Z'),
        validUntil: new Date('2026-08-01T00:00:00.000Z'),
        validUntilSource: 'filename',
        removedAt: null,
        renewalNotifiedAt: null,
        alertedThresholds: [],
      },
      {
        id: 'doc-sub',
        companyId: COMPANY,
        kind: 'cnd_federal',
        fileName: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
        oneDriveItemId: 'od-sub',
        oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
        folderName: 'Federais',
        fileSize: 1024,
        lastModifiedAt: new Date('2026-09-01T00:00:00.000Z'),
        validUntil: new Date('2026-12-12T00:00:00.000Z'),
        validUntilSource: 'filename',
        removedAt: null,
        renewalNotifiedAt: null,
        alertedThresholds: [],
      },
    );

    const port = fakePort([
      {
        folder: 'Federais',
        file: {
          itemId: 'od-expired',
          name: 'CERTIDAO RECEITA FEDERAL 01.08.26 - QL MED.pdf',
          size: 1024,
          lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
        },
      },
    ]);
    port.moveToArchive = async (itemId: string) => {
      archived.push(itemId);
    };

    const result = await runDocumentosIngest(COMPANY, port, NOW);

    expect(result.arquivados).toBe(0);
    expect(archived).toEqual([]);
    expect(memory.docs.find((row) => row.id === 'doc-expired')?.removedAt).toBeNull();
    expect(memory.docs.find((row) => row.id === 'doc-sub')?.removedAt).toEqual(NOW);
  });
});

describe('SPEC-042 — upload toma o lock da ingestão', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMemory();
    lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
    uploadOd.uploadOneDriveFile.mockResolvedValue({ id: 'item-up', name: 'up.pdf' });
    uploadOd.ensureToken.mockResolvedValue('token');
  });

  it('lock ocupado lança DocumentosUploadBusyError e não grava', async () => {
    const { uploadDocumentosPdf, DocumentosUploadBusyError } = await import('@/lib/documentos/upload');
    lock.acquire.mockResolvedValueOnce(null);

    await expect(
      uploadDocumentosPdf({
        companyId: COMPANY,
        kind: 'cnd_federal',
        validUntil: '2026-12-12',
        content: Buffer.from('%PDF-1.4 lock'),
      }),
    ).rejects.toBeInstanceOf(DocumentosUploadBusyError);

    expect(uploadOd.uploadOneDriveFile).not.toHaveBeenCalled();
    expect(memory.creates).toBe(0);
    expect(lock.release).not.toHaveBeenCalled();
  });

  it('sucesso toma o lock e liberta no finally', async () => {
    const { uploadDocumentosPdf } = await import('@/lib/documentos/upload');

    const row = await uploadDocumentosPdf({
      companyId: COMPANY,
      kind: 'cnd_federal',
      validUntil: '2026-12-12',
      content: Buffer.from('%PDF-1.4 lock'),
    });

    expect(row.oneDriveItemId).toBe('item-up');
    expect(lock.acquire).toHaveBeenCalledWith('documentos-ingest:co1');
    expect(lock.release).toHaveBeenCalledTimes(1);
    expect(uploadOd.uploadOneDriveFile).toHaveBeenCalledTimes(1);
  });
});
