import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentosFolderPort } from '@/lib/documentos/ingest';

const logged = vi.hoisted(() => ({ calls: [] as unknown[][] }));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({
    info: (...args: unknown[]) => logged.calls.push(args),
    warn: (...args: unknown[]) => logged.calls.push(args),
    error: (...args: unknown[]) => logged.calls.push(args),
    debug: (...args: unknown[]) => logged.calls.push(args),
  }),
}));

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async ({ data }: { data: { fileName: string } }) => ({
        id: 'doc-1',
        validUntil: new Date('2026-12-12T00:00:00.000Z'),
        renewalNotifiedAt: null,
        fileName: data.fileName,
      })),
      update: vi.fn(),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    companyDocumentIngestState: {
      upsert: vi.fn(async () => ({})),
    },
  },
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: vi.fn(async () => ({ release: async () => undefined })),
  documentosIngestLockKey: (companyId: string) => `documentos-ingest:${companyId}`,
}));

function fakePort(): DocumentosFolderPort {
  return {
    async listPdfs(folderPath: string) {
      const key = folderPath.split('/').filter(Boolean).pop() ?? folderPath;
      if (key !== 'Federais') return [];
      return [
        {
          itemId: 'od-log',
          name: 'CERTIDAO RECEITA FEDERAL 12.12.26 - QL MED.pdf',
          size: 512,
          lastModifiedAt: new Date('2026-09-04T12:00:00.000Z'),
        },
      ];
    },
    async downloadPdf() {
      return Buffer.from('accessToken=nao-pode-vazar-refreshToken');
    },
    async moveToArchive() {},
    // Declarada mesmo vazia: a ingestão exige a capacidade em vez de a inferir.
    async listChildren() {
      return [];
    },
  };
}

function assertSafe(value: unknown, seen = new Set<unknown>()): void {
  if (value == null) return;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    throw new Error('logger recebeu Buffer');
  }
  if (typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) assertSafe(item, seen);
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    expect(key).not.toMatch(/accessToken|refreshToken/i);
    assertSafe(nested, seen);
  }
}

describe('SPEC-042 L4 — logs da ingestão não carregam buffer nem token', () => {
  beforeEach(() => {
    logged.calls.length = 0;
    vi.clearAllMocks();
  });

  it('nenhuma chamada do logger recebe Buffer, accessToken ou refreshToken', async () => {
    const { runDocumentosIngest } = await import('@/lib/documentos/ingest');
    await runDocumentosIngest('co1', fakePort(), new Date('2026-09-04T15:00:00.000Z'));

    expect(logged.calls.length).toBeGreaterThan(0);
    for (const args of logged.calls) {
      for (const arg of args) assertSafe(arg);
    }
  });
});
