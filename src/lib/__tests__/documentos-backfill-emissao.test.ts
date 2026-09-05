import type { CompanyDocumentKind } from '@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT,
  DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_MAX,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from '@/lib/documentos/constants';
import type { DocumentosFolderPort } from '@/lib/documentos/ingest';
import type { PdfValidityResult } from '@/lib/documentos/pdf-validity';

type DocRow = {
  id: string;
  companyId: string;
  category: string;
  kind: CompanyDocumentKind;
  fileName: string;
  oneDriveItemId: string;
  oneDriveAccount: string;
  folderName: string;
  fileSize: number | null;
  lastModifiedAt: Date | null;
  validUntil: Date | null;
  validUntilSource: string | null;
  emitidoEm: Date | null;
  removedAt: Date | null;
  alertedThresholds: number[];
  renewalNotifiedAt: Date | null;
};

const COMPANY = 'company-1';

const NONE: PdfValidityResult = {
  validUntil: null,
  emitidoEm: null,
  confidence: 'nenhuma',
  matchedLabel: null,
  textChars: 0,
};

const memory = vi.hoisted(() => ({
  docs: [] as DocRow[],
  connection: { driveId: 'drive-1' } as { driveId: string } | null,
  seq: 1,
}));

const lock = vi.hoisted(() => ({
  release: vi.fn(async () => undefined),
  acquire: vi.fn(async (): Promise<{ release: () => Promise<undefined> } | null> => ({
    release: async () => lock.release(),
  })),
}));

const pdfValidity = vi.hoisted(() => ({
  readValidityFromPdf: vi.fn(async (): Promise<PdfValidityResult> => NONE),
}));

const openOd = vi.hoisted(() => ({
  openOneDriveItemContent: vi.fn(
    async (): Promise<{ body: ReadableStream<Uint8Array> | null; size: number | null }> => ({
      body: null,
      size: null,
    }),
  ),
  ensureToken: vi.fn(async () => 'token'),
}));

const logger = vi.hoisted(() => ({
  error: vi.fn(),
}));

const authMocks = vi.hoisted(() => ({
  requireEditor: vi.fn(),
  requireDocumentosPage: vi.fn(),
}));

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
  if (where.AND && Array.isArray(where.AND)) {
    return (where.AND as Record<string, unknown>[]).every((part) => matchWhere(row, part));
  }
  if (where.OR && Array.isArray(where.OR)) {
    const rest = { ...where };
    delete rest.OR;
    if (!matchWhere(row, rest)) return false;
    return (where.OR as Record<string, unknown>[]).some((part) => matchWhere(row, part));
  }
  for (const [key, value] of Object.entries(where)) {
    if (key === 'AND' || key === 'OR') continue;
    const current = row[key as keyof DocRow];
    if (value === null) {
      if (current != null) return false;
      continue;
    }
    if (value && typeof value === 'object') {
      const obj = value as {
        not?: unknown;
        lte?: number;
        gt?: string;
        endsWith?: string;
        mode?: string;
      };
      // `gt` é o cursor da varredura. Sem isto no duplo, o teste do avanço
      // passaria sem o cursor fazer nada — mediria a si próprio.
      if ('gt' in obj) {
        if (String(current ?? '') <= String(obj.gt)) return false;
        continue;
      }
      if ('not' in obj) {
        if (current === obj.not) return false;
        continue;
      }
      if ('endsWith' in obj && typeof obj.endsWith === 'string') {
        const name = String(current ?? '');
        const ok =
          obj.mode === 'insensitive'
            ? name.toLowerCase().endsWith(obj.endsWith.toLowerCase())
            : name.endsWith(obj.endsWith);
        if (!ok) return false;
        continue;
      }
      if ('lte' in obj) {
        if (current == null || Number(current) > Number(obj.lte)) return false;
        continue;
      }
    }
    if (current !== value) return false;
  }
  return true;
}

function sortRows(rows: DocRow[], orderBy?: Record<string, string> | Record<string, string>[]): DocRow[] {
  if (!orderBy) return rows;
  const spec = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const item of spec) {
      const [key, dir] = Object.entries(item)[0] as [keyof DocRow, string];
      const av = String(a[key] ?? '');
      const bv = String(b[key] ?? '');
      if (av === bv) continue;
      return dir === 'desc' ? (av < bv ? 1 : -1) : av < bv ? -1 : 1;
    }
    return 0;
  });
}

vi.mock('@/lib/prisma', () => ({
  default: {
    companyDocument: {
      findMany: vi.fn(async ({
        where,
        orderBy,
        select,
        take,
      }: {
        where?: Record<string, unknown>;
        orderBy?: Record<string, string>;
        select?: Record<string, boolean>;
        take?: number;
      }) => {
        const matched = memory.docs.filter((row) => matchWhere(row, where));
        const ordered = sortRows(matched, orderBy);
        const limitado = typeof take === 'number' ? ordered.slice(0, take) : ordered;
        return limitado.map((row) => pick(row, select));
      }),
      count: vi.fn(async ({ where }: { where?: Record<string, unknown> }) =>
        memory.docs.filter((row) => matchWhere(row, where)).length,
      ),
      update: vi.fn(async ({
        where,
        data,
      }: {
        where: { id: string };
        data: Partial<DocRow>;
      }) => {
        const row = memory.docs.find((item) => item.id === where.id);
        if (!row) throw new Error('document missing');
        Object.assign(row, data);
        return row;
      }),
      create: vi.fn(),
      delete: vi.fn(),
    },
    oneDriveConnection: {
      findFirst: vi.fn(async () => memory.connection),
    },
  },
}));

vi.mock('@/lib/postgres-advisory-lock', () => ({
  acquirePostgresAdvisoryLock: lock.acquire,
  documentosIngestLockKey: (companyId: string) => `documentos-ingest:${companyId}`,
}));

vi.mock('@/lib/documentos/pdf-validity', () => ({
  readValidityFromPdf: pdfValidity.readValidityFromPdf,
}));

vi.mock('@/lib/onedrive-client', () => ({
  openOneDriveItemContent: openOd.openOneDriveItemContent,
}));

vi.mock('@/lib/onedrive-connections', () => ({
  ensureValidOneDriveAccessToken: openOd.ensureToken,
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ error: logger.error, warn: vi.fn(), info: vi.fn() }),
}));

vi.mock('@/lib/auth', async () => {
  const { NextResponse } = await import('next/server');
  return {
    requireEditor: authMocks.requireEditor,
    unauthorizedResponse: () => NextResponse.json({ error: 'Não autorizado' }, { status: 401 }),
    forbiddenResponse: () => NextResponse.json({ error: 'Sem permissão' }, { status: 403 }),
  };
});

vi.mock('@/lib/documentos/access', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/documentos/access')>();
  return {
    ...actual,
    requireDocumentosPage: authMocks.requireDocumentosPage,
  };
});

import prisma from '@/lib/prisma';
import {
  clampBackfillEmissaoLimite,
  documentosBackfillEmissaoLockKey,
  runBackfillEmissao,
} from '@/lib/documentos/backfill-emissao';
import { POST } from '@/app/api/documentos/backfill-emissao/route';

function seedRow(overrides: Partial<DocRow> = {}): DocRow {
  const id = overrides.id ?? `doc-${String(memory.seq++).padStart(3, '0')}`;
  const row: DocRow = {
    companyId: COMPANY,
    category: 'certidao',
    kind: 'cnd_federal',
    fileName: `${id}.pdf`,
    oneDriveItemId: `od-${id}`,
    oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
    folderName: 'Federais',
    fileSize: 1024,
    lastModifiedAt: new Date('2026-01-15T12:00:00.000Z'),
    validUntil: new Date('2026-12-12T00:00:00.000Z'),
    validUntilSource: 'filename',
    emitidoEm: null,
    removedAt: null,
    alertedThresholds: [30],
    renewalNotifiedAt: new Date('2026-01-01T00:00:00.000Z'),
    ...overrides,
    id,
  };
  memory.docs.push(row);
  return row;
}

function fakePort(downloadPdf: DocumentosFolderPort['downloadPdf']): DocumentosFolderPort {
  return {
    listPdfs: async () => [],
    downloadPdf,
    moveToArchive: async () => undefined,
  };
}

function emitted(ymd: string): PdfValidityResult {
  return { ...NONE, emitidoEm: ymd, confidence: 'alta', matchedLabel: 'emitido em', textChars: 20 };
}

beforeEach(() => {
  memory.docs.length = 0;
  memory.connection = { driveId: 'drive-1' };
  memory.seq = 1;
  lock.release.mockClear();
  lock.acquire.mockReset();
  lock.acquire.mockImplementation(async () => ({ release: async () => lock.release() }));
  pdfValidity.readValidityFromPdf.mockReset();
  pdfValidity.readValidityFromPdf.mockResolvedValue(emitted('2026-08-31'));
  openOd.openOneDriveItemContent.mockReset();
  openOd.ensureToken.mockReset();
  openOd.ensureToken.mockResolvedValue('token');
  logger.error.mockReset();
  authMocks.requireEditor.mockReset();
  authMocks.requireEditor.mockResolvedValue({ userId: 'user-1', role: 'editor' });
  authMocks.requireDocumentosPage.mockReset();
  authMocks.requireDocumentosPage.mockResolvedValue({
    ok: true,
    companyId: COMPANY,
    userId: 'user-1',
    role: 'editor',
  });
  vi.mocked(prisma.companyDocument.update).mockClear();
  vi.mocked(prisma.companyDocument.findMany).mockClear();
  vi.mocked(prisma.companyDocument.create).mockClear();
  vi.mocked(prisma.companyDocument.delete).mockClear();
});

describe('SPEC-042 L14 — runBackfillEmissao', () => {
  it('ficheiro grande é ignorado sem materializar', async () => {
    const large = seedRow({ id: 'a-large', fileSize: DOCUMENTOS_UPLOAD_MAX_BYTES + 1 });
    const small = seedRow({ id: 'b-small', fileSize: 2048 });
    const downloadPdf = vi.fn(async (itemId: string) => {
      expect(itemId).not.toBe(large.oneDriveItemId);
      return Buffer.from('%PDF-small');
    });

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf), limite: 25 });

    expect(downloadPdf).not.toHaveBeenCalledWith(large.oneDriveItemId);
    expect(downloadPdf).toHaveBeenCalledTimes(1);
    expect(downloadPdf).toHaveBeenCalledWith(small.oneDriveItemId);
    expect(result.ignorados).toBe(1);
    expect(result.preenchidos).toBe(1);
    expect(result.falhas).toBe(0);
    expect(large.emitidoEm).toBeNull();
    expect(small.emitidoEm).toEqual(new Date('2026-08-31T00:00:00.000Z'));
  });

  it('PDF sem emissão não grava lastModifiedAt em emitidoEm', async () => {
    const lastModifiedAt = new Date('2026-01-15T12:00:00.000Z');
    const row = seedRow({ lastModifiedAt, emitidoEm: null });
    pdfValidity.readValidityFromPdf.mockResolvedValue(NONE);
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF-sem-emissao'));

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(result.preenchidos).toBe(0);
    expect(result.semEmissao).toBe(1);
    expect(row.emitidoEm).toBeNull();
    expect(prisma.companyDocument.update).not.toHaveBeenCalled();
  });

  it('só toca em emitidoEm', async () => {
    const row = seedRow({
      validUntil: new Date('2026-12-12T00:00:00.000Z'),
      validUntilSource: 'filename',
      removedAt: null,
      alertedThresholds: [30, 15],
      renewalNotifiedAt: new Date('2026-02-02T00:00:00.000Z'),
    });
    const before = {
      validUntil: row.validUntil,
      validUntilSource: row.validUntilSource,
      removedAt: row.removedAt,
      alertedThresholds: [...row.alertedThresholds],
      renewalNotifiedAt: row.renewalNotifiedAt,
      fileName: row.fileName,
    };
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF-ok'));

    await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(prisma.companyDocument.update).toHaveBeenCalledTimes(1);
    const data = vi.mocked(prisma.companyDocument.update).mock.calls[0]?.[0]?.data as Record<string, unknown>;
    expect(Object.keys(data)).toEqual(['emitidoEm']);
    expect(row.emitidoEm).toEqual(new Date('2026-08-31T00:00:00.000Z'));
    expect(row.validUntil).toEqual(before.validUntil);
    expect(row.validUntilSource).toBe(before.validUntilSource);
    expect(row.removedAt).toBe(before.removedAt);
    expect(row.alertedThresholds).toEqual(before.alertedThresholds);
    expect(row.renewalNotifiedAt).toEqual(before.renewalNotifiedAt);
    expect(row.fileName).toBe(before.fileName);
    expect(memory.docs).toHaveLength(1);
    expect(prisma.companyDocument.create).not.toHaveBeenCalled();
    expect(prisma.companyDocument.delete).not.toHaveBeenCalled();
  });

  it('não dispara downloads em paralelo', async () => {
    seedRow({ id: 'd1' });
    seedRow({ id: 'd2' });
    seedRow({ id: 'd3' });
    let inFlight = 0;
    let maxInFlight = 0;
    const downloadPdf = vi.fn(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 30));
      inFlight -= 1;
      return Buffer.from('%PDF-seq');
    });

    await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf), limite: 25 });

    expect(downloadPdf).toHaveBeenCalledTimes(3);
    expect(maxInFlight).toBe(1);
  });

  it('Content-Length acima do teto cancela o corpo sem ler o PDF', async () => {
    seedRow({ id: 'c-len', fileSize: 100 });
    const cancel = vi.fn(async () => undefined);
    const openContent = vi.fn(async () => ({
      body: { cancel } as unknown as ReadableStream<Uint8Array>,
      size: DOCUMENTOS_UPLOAD_MAX_BYTES + 1,
    }));

    const result = await runBackfillEmissao(COMPANY, { openContent });

    expect(cancel).toHaveBeenCalled();
    expect(pdfValidity.readValidityFromPdf).not.toHaveBeenCalled();
    expect(result.ignorados).toBe(1);
    expect(result.preenchidos).toBe(0);
    expect(result.falhas).toBe(0);
  });

  it('findMany manda orderBy id asc — não confia na ordem de inserção', async () => {
    seedRow({ id: 'z-last' });
    seedRow({ id: 'a-first' });
    seedRow({ id: 'm-mid' });
    const seen: string[] = [];
    const downloadPdf = vi.fn(async (itemId: string) => {
      seen.push(itemId);
      return Buffer.from('%PDF');
    });

    await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(prisma.companyDocument.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { id: 'asc' } }),
    );
    expect(seen).toEqual(['od-a-first', 'od-m-mid', 'od-z-last']);
  });

  it('emissão posterior à validade gravada conta semEmissao e não grava', async () => {
    const row = seedRow({ validUntil: new Date('2026-01-01T00:00:00.000Z') });
    pdfValidity.readValidityFromPdf.mockResolvedValue(emitted('2026-06-01'));
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF'));

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(result.semEmissao).toBe(1);
    expect(result.preenchidos).toBe(0);
    expect(row.emitidoEm).toBeNull();
    expect(prisma.companyDocument.update).not.toHaveBeenCalled();
  });

  it('não processa balanço, removido, outra conta, nem quem já tem emissão', async () => {
    seedRow({ id: 'ok' });
    seedRow({ id: 'bal', category: 'balanco', fileName: 'BALANCO 2026.zip' });
    seedRow({ id: 'gone', removedAt: new Date('2026-01-01T00:00:00.000Z') });
    seedRow({ id: 'other', oneDriveAccount: 'outro@qlmed.com.br' });
    seedRow({ id: 'has', emitidoEm: new Date('2026-03-03T00:00:00.000Z') });
    seedRow({ id: 'zip', fileName: 'anexo.zip', fileSize: 100 });
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF'));

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(downloadPdf).toHaveBeenCalledTimes(1);
    expect(downloadPdf).toHaveBeenCalledWith('od-ok');
    expect(result.preenchidos).toBe(1);
    expect(result.ignorados).toBe(1);
    expect(memory.docs.find((row) => row.id === 'bal')?.emitidoEm).toBeNull();
  });

  it('limite do cliente é teto 100; omissão é 25', async () => {
    expect(clampBackfillEmissaoLimite(undefined)).toBe(DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT);
    expect(clampBackfillEmissaoLimite(1000)).toBe(DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_MAX);
    for (let i = 0; i < 40; i += 1) seedRow({ id: `n${String(i).padStart(2, '0')}` });
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF'));

    const def = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });
    expect(def.preenchidos).toBe(25);
    expect(downloadPdf).toHaveBeenCalledTimes(25);
    expect(def.restantes).toBe(15);

    downloadPdf.mockClear();
    const capped = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf), limite: 1000 });
    expect(capped.preenchidos).toBe(15);
    expect(downloadPdf).toHaveBeenCalledTimes(15);
  });

  it('lock ocupado devolve vazio com ocupado, sem download e sem exceção', async () => {
    seedRow({ id: 'waiting' });
    lock.acquire.mockResolvedValue(null);
    const downloadPdf = vi.fn(async () => Buffer.from('%PDF'));

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(result).toEqual({
      processados: 0,
      preenchidos: 0,
      semEmissao: 0,
      ignorados: 0,
      falhas: 0,
      restantes: 1,
      proximoId: null,
      ocupado: true,
    });
    expect(downloadPdf).not.toHaveBeenCalled();
    expect(lock.acquire).toHaveBeenCalledWith(documentosBackfillEmissaoLockKey(COMPANY));
    expect(lock.acquire).toHaveBeenCalledWith(`documentos-backfill-emissao:${COMPANY}`);
    expect(lock.acquire).not.toHaveBeenCalledWith(`documentos-ingest:${COMPANY}`);
  });

  it('download que rebenta conta falha e segue o lote', async () => {
    seedRow({ id: 'a' });
    seedRow({ id: 'b' });
    const downloadPdf = vi.fn(async (itemId: string) => {
      if (itemId === 'od-a') throw new Error('graph 500');
      return Buffer.from('%PDF');
    });

    const result = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf) });

    expect(result.falhas).toBe(1);
    expect(result.preenchidos).toBe(1);
    expect(lock.release).toHaveBeenCalled();
  });
});

describe('POST /api/documentos/backfill-emissao', () => {
  it('viewer recebe 403', async () => {
    authMocks.requireEditor.mockRejectedValue(new Error('FORBIDDEN'));
    const res = await POST(new Request('http://localhost/api/documentos/backfill-emissao', { method: 'POST' }));
    expect(res.status).toBe(403);
    expect(lock.acquire).not.toHaveBeenCalled();
  });

  it('corpo vazio corre o lote e devolve BackfillResult', async () => {
    seedRow({ id: 'api-1' });
    openOd.openOneDriveItemContent.mockResolvedValue({
      body: new Response(Buffer.from('%PDF-api')).body,
      size: 8,
    });

    const res = await POST(new Request('http://localhost/api/documentos/backfill-emissao', { method: 'POST' }));
    expect(res.status).toBe(200);
    const body = await res.json() as { preenchidos: number; ocupado: boolean };
    expect(body.preenchidos).toBe(1);
    expect(body.ocupado).toBe(false);
  });

  it('limite 1000 é limitado ao teto, não recusado', async () => {
    for (let i = 0; i < 12; i += 1) seedRow({ id: `lim${String(i).padStart(2, '0')}` });
    openOd.openOneDriveItemContent.mockImplementation(async () => ({
      body: new Response(Buffer.from('%PDF')).body,
      size: 4,
    }));

    const res = await POST(
      new Request('http://localhost/api/documentos/backfill-emissao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limite: 1000 }),
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json() as { preenchidos: number };
    expect(body.preenchidos).toBe(12);
  });

  it('lock ocupado é 200 com ocupado, não 409', async () => {
    seedRow({ id: 'busy' });
    lock.acquire.mockResolvedValue(null);
    const res = await POST(new Request('http://localhost/api/documentos/backfill-emissao', { method: 'POST' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ocupado: true, processados: 0, preenchidos: 0 });
  });

  it('erro vai ao log já sanitizado por sanitizeError', async () => {
    lock.acquire.mockRejectedValue(new Error('SMTP auth failed password=SuperSecretPassXYZ accessToken=AbC123Segredo'));
    const res = await POST(new Request('http://localhost/api/documentos/backfill-emissao', { method: 'POST' }));
    expect(res.status).toBe(500);
    const dumped = JSON.stringify(logger.error.mock.calls);
    expect(dumped).not.toContain('SuperSecretPassXYZ');
    expect(dumped).not.toContain('AbC123Segredo');
    expect(dumped).toContain('password=[redacted]');
    expect(dumped).toContain('accessToken=[redacted]');
  });
});

describe('SPEC-042 — a varredura tem de AVANÇAR', () => {
  /**
   * As candidatas saem de `emitidoEm: null`. Uma linha cujo PDF não declara a
   * emissão continua com null, portanto SEM CURSOR volta a ser a primeira da
   * fila e é re-descarregada a cada clique. Com 25 dessas à cabeça, a varredura
   * nunca chegaria à 26.ª e `restantes` ficaria preso — o botão convidaria ao
   * clique para sempre, gastando rede e heap sem progresso nenhum.
   */
  it('linha sem emissão legível não trava o lote seguinte', async () => {
    const a = seedRow({ id: 'a-sem-emissao', fileName: 'A.pdf', fileSize: 2048 });
    const b = seedRow({ id: 'b-com-emissao', fileName: 'B.pdf', fileSize: 2048 });

    const downloadPdf = vi.fn(async (itemId: string) =>
      Buffer.from(itemId === a.oneDriveItemId ? '%PDF-A' : '%PDF-B'),
    );
    pdfValidity.readValidityFromPdf.mockImplementation(async (buf: Buffer) =>
      String(buf).includes('%PDF-B')
        ? emitted('2026-03-01')
        : { validUntil: null, emitidoEm: null, confidence: 'nenhuma' as const, matchedLabel: null, textChars: 20 },
    );

    const primeiro = await runBackfillEmissao(COMPANY, { port: fakePort(downloadPdf), limite: 1 });
    expect(primeiro.proximoId).toBe(a.id);
    expect(primeiro.semEmissao).toBe(1);
    expect(a.emitidoEm).toBeNull();

    const segundo = await runBackfillEmissao(COMPANY, {
      port: fakePort(downloadPdf),
      limite: 1,
      aposId: primeiro.proximoId,
    });
    expect(segundo.proximoId).toBe(b.id);
    expect(segundo.preenchidos).toBe(1);
    expect(b.emitidoEm).toEqual(new Date('2026-03-01T00:00:00.000Z'));
    expect(segundo.restantes).toBe(0);
  });
});

describe('SPEC-042 — corpo sem Content-Length também tem teto', () => {
  /**
   * Quando o Graph responde em chunks sem `Content-Length`, o teto por cabeçalho
   * não se aplica e a única defesa é contar bytes ao ler. O contentor corre com
   * `mem_limit: 1g` e a materialização tem pico de ~3x, portanto um corpo de
   * algumas centenas de MB derruba a APLICAÇÃO, não só o pedido.
   *
   * Este teste existia em falta: apagar a guarda `total > maxBytes` mantinha a
   * suíte inteira verde.
   */
  it('aborta a leitura ao passar do teto e não chama o leitor de PDF', async () => {
    const row = seedRow({ id: 'a-chunked', fileName: 'grande.pdf', fileSize: null });
    const pedaco = new Uint8Array(64 * 1024);
    let entregues = 0;

    const openContent = vi.fn(async () => ({
      size: null as number | null,
      body: new ReadableStream<Uint8Array>({
        pull(controller) {
          entregues += 1;
          // Muito acima do teto se ninguém parar a leitura.
          if (entregues > 5000) controller.close();
          else controller.enqueue(pedaco);
        },
      }),
    }));

    const result = await runBackfillEmissao(COMPANY, { openContent, limite: 5 });

    expect(result.ignorados).toBe(1);
    expect(result.preenchidos).toBe(0);
    expect(row.emitidoEm).toBeNull();
    expect(pdfValidity.readValidityFromPdf).not.toHaveBeenCalled();
    // Parou cedo: não leu os 5000 pedaços (~320 MB).
    expect(entregues * pedaco.byteLength).toBeLessThan(DOCUMENTOS_UPLOAD_MAX_BYTES * 3);
  });
});
