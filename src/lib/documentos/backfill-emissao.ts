import type { OneDriveConnection } from '@prisma/client';
import prismaDefault from '@/lib/prisma';
import { openOneDriveItemContent } from '@/lib/onedrive-client';
import { ensureValidOneDriveAccessToken } from '@/lib/onedrive-connections';
import { acquirePostgresAdvisoryLock } from '@/lib/postgres-advisory-lock';
import {
  DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT,
  DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_MAX,
  DOCUMENTOS_ONEDRIVE_ACCOUNT,
  DOCUMENTOS_UPLOAD_MAX_BYTES,
} from './constants';
import type { DocumentosFolderPort } from './ingest';
import { readValidityFromPdf } from './pdf-validity';
import { toYmd } from './validity';

export type BackfillResult = {
  processados: number;
  preenchidos: number;
  semEmissao: number;
  ignorados: number;
  falhas: number;
  restantes: number;
  /**
   * Id da última linha EXAMINADA neste lote — processada, ignorada ou falhada.
   * O cliente devolve-o no pedido seguinte para a varredura AVANÇAR.
   *
   * Sem isto o lote não progride: as candidatas saem de `emitidoEm: null`, e
   * uma linha cujo PDF não declara emissão continua com null, logo volta a ser
   * a primeira da fila e é re-descarregada em cada clique. Com 25 dessas à
   * cabeça, a varredura nunca chega à 26.ª e `restantes` fica preso.
   */
  proximoId: string | null;
  /** Lock próprio ocupado — resultado vazio, não é exceção. */
  ocupado: boolean;
};

export type BackfillOpenContent = (itemId: string) => Promise<{
  body: ReadableStream<Uint8Array> | null;
  size: number | null;
}>;

type BackfillPrisma = {
  companyDocument: {
    findMany: (args: {
      take?: number;
      where: unknown;
      orderBy?: unknown;
      select?: unknown;
    }) => Promise<Candidate[]>;
    count: (args: { where: unknown }) => Promise<number>;
    update: (args: { where: { id: string }; data: { emitidoEm: Date } }) => Promise<unknown>;
  };
  oneDriveConnection: {
    findFirst: (args: unknown) => Promise<OneDriveConnection | null>;
  };
};

type Candidate = {
  id: string;
  fileName: string;
  fileSize: number | null;
  oneDriveItemId: string;
  validUntil: Date | string | null;
  category: string;
};

export type BackfillEmissaoOpts = {
  limite?: number;
  /** Cursor: continua depois desta linha. Vem do `proximoId` do lote anterior. */
  aposId?: string | null;
  port?: DocumentosFolderPort;
  prisma?: BackfillPrisma;
  openContent?: BackfillOpenContent;
};

export function documentosBackfillEmissaoLockKey(companyId: string): string {
  return `documentos-backfill-emissao:${companyId}`;
}

export function clampBackfillEmissaoLimite(raw?: number): number {
  if (raw == null || !Number.isFinite(raw)) return DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT;
  const n = Math.trunc(raw);
  if (n < 1) return DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_DEFAULT;
  return Math.min(n, DOCUMENTOS_BACKFILL_EMISSAO_LIMITE_MAX);
}

function dateFromYmd(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function isPdfFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.pdf');
}

function exceedsUploadCap(size: number | null | undefined): boolean {
  return size != null && Number.isFinite(size) && size > DOCUMENTOS_UPLOAD_MAX_BYTES;
}

function candidateWhere(companyId: string, aposId?: string | null) {
  return {
    companyId,
    emitidoEm: null,
    ...(aposId ? { id: { gt: aposId } } : {}),
    removedAt: null,
    oneDriveAccount: DOCUMENTOS_ONEDRIVE_ACCOUNT,
    category: { not: 'balanco' },
    oneDriveItemId: { not: '' },
  };
}

/**
 * `restantes` conta o que FALTA VISITAR nesta varredura, não o que continua sem
 * emissão no total. A diferença importa: uma linha cujo PDF não declara emissão
 * fica para sempre com `emitidoEm: null`, portanto um total global nunca
 * chegaria a zero e o botão convidaria ao clique indefinidamente.
 */
function processableWhere(companyId: string, aposId?: string | null) {
  return {
    ...candidateWhere(companyId, aposId),
    fileName: { endsWith: '.pdf', mode: 'insensitive' as const },
    OR: [{ fileSize: null }, { fileSize: { lte: DOCUMENTOS_UPLOAD_MAX_BYTES } }],
  };
}

function emptyResult(restantes: number, ocupado: boolean): BackfillResult {
  return {
    processados: 0,
    preenchidos: 0,
    semEmissao: 0,
    ignorados: 0,
    falhas: 0,
    restantes,
    proximoId: null,
    ocupado,
  };
}

/**
 * Materializa o corpo só depois do teto. Sem Content-Length, aborta a leitura
 * ao passar de `maxBytes` — concatenar um ZIP de centenas de MB tem pico ~3×
 * e derruba o processo (`mem_limit: 1g`).
 */
async function materializeCapped(
  content: { body: ReadableStream<Uint8Array> | null; size: number | null },
  maxBytes: number,
): Promise<Buffer | 'too-large' | 'empty'> {
  if (content.size !== null && content.size > maxBytes) {
    if (content.body) await content.body.cancel().catch(() => undefined);
    return 'too-large';
  }
  if (!content.body) return 'empty';
  if (content.size !== null) {
    return Buffer.from(await new Response(content.body).arrayBuffer());
  }
  const reader = content.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      return 'too-large';
    }
    chunks.push(value);
  }
  return chunks.length === 0 ? Buffer.alloc(0) : Buffer.concat(chunks);
}

async function resolveOpen(
  companyId: string,
  db: BackfillPrisma,
  opts?: BackfillEmissaoOpts,
): Promise<BackfillOpenContent | 'port'> {
  if (opts?.openContent) return opts.openContent;
  if (opts?.port) return 'port';
  const connection = await db.oneDriveConnection.findFirst({
    where: { companyId, accountEmail: DOCUMENTOS_ONEDRIVE_ACCOUNT },
  });
  if (!connection) {
    throw new Error('conta faturamento@ não conectada');
  }
  const accessToken = await ensureValidOneDriveAccessToken(connection);
  return (itemId) => openOneDriveItemContent(accessToken, connection.driveId, itemId);
}

/**
 * Preenche `emitidoEm` em lote. Só escreve esse campo, só a partir de
 * `readValidityFromPdf`, um download de cada vez.
 */
export async function runBackfillEmissao(
  companyId: string,
  opts?: BackfillEmissaoOpts,
): Promise<BackfillResult> {
  const db = (opts?.prisma ?? prismaDefault) as BackfillPrisma;
  const limite = clampBackfillEmissaoLimite(opts?.limite);

  const lock = await acquirePostgresAdvisoryLock(documentosBackfillEmissaoLockKey(companyId));
  if (!lock) {
    const restantes = await db.companyDocument.count({
      where: processableWhere(companyId, opts?.aposId),
    });
    return emptyResult(restantes, true);
  }

  try {
    const opener = await resolveOpen(companyId, db, opts);
    const rows = await db.companyDocument.findMany({
      // `take` limitado: sem ele a consulta trazia TODAS as candidatas para a
      // heap a cada pedido, e o limite só travava os downloads. O fator 4 dá
      // folga para as ignoradas (balanço, não-PDF, grandes) sem carregar tudo.
      take: limite * 4,
      where: candidateWhere(companyId, opts?.aposId),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        fileName: true,
        fileSize: true,
        oneDriveItemId: true,
        validUntil: true,
        category: true,
      },
    });

    const result: BackfillResult = emptyResult(0, false);
    let downloads = 0;

    for (const row of rows) {
      if (downloads >= limite) break;
      // Examinada conta como avanço, mesmo quando ignorada ou sem emissão.
      result.proximoId = row.id;
      if (row.category === 'balanco' || !isPdfFileName(row.fileName) || exceedsUploadCap(row.fileSize)) {
        result.ignorados += 1;
        continue;
      }

      downloads += 1;
      let pdf: Buffer | 'too-large' | 'empty';
      try {
        if (opener === 'port') {
          const port = opts?.port;
          if (!port) {
            result.falhas += 1;
            continue;
          }
          const buf = await port.downloadPdf(row.oneDriveItemId);
          pdf = buf.byteLength > DOCUMENTOS_UPLOAD_MAX_BYTES ? 'too-large' : buf;
        } else {
          pdf = await materializeCapped(await opener(row.oneDriveItemId), DOCUMENTOS_UPLOAD_MAX_BYTES);
        }
      } catch {
        result.falhas += 1;
        continue;
      }

      if (pdf === 'too-large') {
        result.ignorados += 1;
        continue;
      }
      if (pdf === 'empty') {
        result.falhas += 1;
        continue;
      }

      try {
        const parsed = await readValidityFromPdf(pdf);
        const emitido = parsed.emitidoEm;
        if (!emitido) {
          result.semEmissao += 1;
          continue;
        }
        const storedValid = toYmd(row.validUntil);
        if (storedValid && emitido > storedValid) {
          result.semEmissao += 1;
          continue;
        }
        await db.companyDocument.update({
          where: { id: row.id },
          data: { emitidoEm: dateFromYmd(emitido) },
        });
        result.preenchidos += 1;
      } catch {
        result.falhas += 1;
      }
    }

    result.processados = result.preenchidos + result.semEmissao + result.ignorados + result.falhas;
    result.restantes = await db.companyDocument.count({
      where: processableWhere(companyId, result.proximoId ?? opts?.aposId),
    });
    return result;
  } finally {
    await lock.release();
  }
}
