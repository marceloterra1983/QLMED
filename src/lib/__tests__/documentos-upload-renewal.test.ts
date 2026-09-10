import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderPort } from '@/lib/documentos/ingest';

type DocRow = {
  id: string;
  companyId: string;
  kind: CompanyDocumentKind;
  fileName: string;
  oneDriveItemId: string;
  validUntil: Date | null;
  removedAt: Date | null;
  renewalNotifiedAt: Date | null;
  alertedThresholds: number[];
};

const memory = vi.hoisted(() => ({
  docs: [] as DocRow[],
}));

const notify = vi.hoisted(() => vi.fn(async () => undefined));
const createPort = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({ where }: { where?: Record<string, unknown> }) => {
        return memory.docs.filter((row) => {
          if (!where) return true;
          if (where.companyId != null && row.companyId !== where.companyId) return false;
          if (where.kind != null && row.kind !== where.kind) return false;
          if (where.removedAt === null && row.removedAt != null) return false;
          if (where.id && typeof where.id === 'object' && where.id !== null && 'not' in where.id) {
            if (row.id === (where.id as { not: string }).not) return false;
          }
          return true;
        });
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return memory.docs.find((row) => row.id === where.id) ?? null;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<DocRow> }) => {
        const row = memory.docs.find((item) => item.id === where.id);
        if (!row) throw new Error('missing');
        Object.assign(row, data);
        return row;
      }),
    },
  },
}));

vi.mock('@/lib/documentos/alerts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentos/alerts')>();
  return {
    ...actual,
    notifyRenewals: notify,
  };
});

vi.mock('@/lib/documentos/onedrive-port', () => ({
  createDocumentosFolderPort: createPort,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

function seed(row: Partial<DocRow> & Pick<DocRow, 'id' | 'kind' | 'validUntil'>) {
  memory.docs.push({
    companyId: 'co1',
    fileName: `${row.kind}.pdf`,
    oneDriveItemId: `od-${row.id}`,
    removedAt: null,
    renewalNotifiedAt: null,
    alertedThresholds: [],
    ...row,
  });
}

describe('afterDocumentosUpload (FR-007 + FR-011 + FR-016)', () => {
  beforeEach(() => {
    memory.docs.length = 0;
    notify.mockClear();
    createPort.mockReset();
  });

  it('upload com validade maior que o vigente anterior dispara notifyRenewals e arquiva', async () => {
    const { afterDocumentosUpload } = await import('@/lib/documentos/after-upload');
    seed({
      id: 'old',
      kind: 'cnd_estadual_mt',
      validUntil: new Date('2026-08-13T00:00:00.000Z'),
      fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 13.08.26.pdf',
    });
    seed({
      id: 'new',
      kind: 'cnd_estadual_mt',
      validUntil: new Date('2026-11-08T00:00:00.000Z'),
      fileName: 'CERTIDÃO ESTADUAL DO MATO GROSSO 08.11.26.pdf',
    });

    const archived: string[] = [];
    const port: DocumentosFolderPort = {
      async listPdfs() {
        return [];
      },
      async downloadPdf() {
        return Buffer.from('%PDF');
      },
      async moveToArchive(itemId: string) {
        archived.push(itemId);
      },
    };
    createPort.mockResolvedValue(port);

    await afterDocumentosUpload({
      companyId: 'co1',
      kind: 'cnd_estadual_mt',
      documentId: 'new',
      validUntilYmd: '2026-11-08',
      port,
      now: new Date('2026-09-10T15:00:00.000Z'),
    });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      [
        {
          companyId: 'co1',
          kind: 'cnd_estadual_mt',
          documentId: 'new',
          previousValidUntil: '2026-08-13',
          validUntil: '2026-11-08',
        },
      ],
      undefined,
    );
    expect(archived).toEqual(['od-old']);
  });

  it('primeira carga (sem vigente anterior) não notifica', async () => {
    const { afterDocumentosUpload } = await import('@/lib/documentos/after-upload');
    seed({
      id: 'new',
      kind: 'cnd_estadual_mt',
      validUntil: new Date('2026-11-08T00:00:00.000Z'),
    });
    const port: DocumentosFolderPort = {
      async listPdfs() {
        return [];
      },
      async downloadPdf() {
        return Buffer.from('%PDF');
      },
      async moveToArchive() {
        throw new Error('não deveria arquivar');
      },
    };

    await afterDocumentosUpload({
      companyId: 'co1',
      kind: 'cnd_estadual_mt',
      documentId: 'new',
      validUntilYmd: '2026-11-08',
      port,
      now: new Date('2026-09-10T15:00:00.000Z'),
    });

    expect(notify).not.toHaveBeenCalled();
  });
});
