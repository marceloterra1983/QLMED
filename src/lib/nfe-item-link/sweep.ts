/**
 * SPEC-047 — varredura idempotente de todas as NF-e recebidas desde uma data.
 * Um lock por empresa; páginas de 100 notas; índice e memória carregados uma
 * vez e a memória cresce durante a corrida (S6 automático).
 */
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { acquirePostgresAdvisoryLock, nfeItemLinkLockKey } from '@/lib/postgres-advisory-lock';
import {
  decideInvoiceItems,
  loadLinkMemory,
  loadRegistryIndex,
  rememberDecision,
  writeInvoiceLinks,
  type ItemLinkRow,
  type LinkWriteStats,
} from './store';

const log = createLogger('nfe-item-link-sweep');

export const SWEEP_DEFAULT_SINCE = new Date('2021-01-01T00:00:00.000Z');
const PAGE_SIZE = 100;

export interface SweepOptions {
  companyId: string;
  since?: Date;
  dryRun?: boolean;
  force?: boolean;
  /** Só decide, sem ler nem escrever a tabela de vínculos (diagnóstico antes da migration). */
  diagnosticOnly?: boolean;
  /** recebe cada linha decidida (para CSV de backup) */
  onRow?: (row: ItemLinkRow & { invoiceId: string; invoiceNumber: string; issueDate: Date | null }) => void;
}

export interface SweepResult {
  companyId: string;
  since: string;
  dryRun: boolean;
  invoices: number;
  items: number;
  linked: number;
  pending: number;
  writes: number;
  skippedManual: number;
  skippedOutOfScope: number;
  byStrategy: Record<string, number>;
  pendingDistinctCodes: number;
  durationMs: number;
}

function merge(total: LinkWriteStats, part: LinkWriteStats) {
  total.items += part.items;
  total.linked += part.linked;
  total.pending += part.pending;
  total.writes += part.writes;
  total.skippedManual += part.skippedManual;
  total.skippedOutOfScope += part.skippedOutOfScope;
  for (const [k, v] of Object.entries(part.byStrategy)) total.byStrategy[k] = (total.byStrategy[k] || 0) + v;
}

function statsFromRows(rows: ItemLinkRow[]): LinkWriteStats {
  const stats: LinkWriteStats = { items: rows.length, linked: 0, pending: 0, writes: 0, skippedManual: 0, skippedOutOfScope: 0, byStrategy: {} };
  for (const row of rows) {
    const s = row.decision?.strategy;
    if (s && s.startsWith('SKIPPED_')) {
      stats.skippedOutOfScope++;
      stats.byStrategy[s] = (stats.byStrategy[s] || 0) + 1;
    } else if (row.decision?.productId) {
      stats.linked++;
      stats.byStrategy[row.decision.strategy] = (stats.byStrategy[row.decision.strategy] || 0) + 1;
    } else {
      stats.pending++;
    }
  }
  return stats;
}

/** @returns null quando outra varredura já detém o lock da empresa. */
export async function runNfeItemLinkSweep(opts: SweepOptions): Promise<SweepResult | null> {
  const lock = await acquirePostgresAdvisoryLock(nfeItemLinkLockKey(opts.companyId));
  if (!lock) return null;
  const startedAt = Date.now();
  const since = opts.since ?? SWEEP_DEFAULT_SINCE;
  try {
    const index = await loadRegistryIndex(opts.companyId, { fresh: true });
    const memory = opts.diagnosticOnly ? new Map() : await loadLinkMemory(opts.companyId);
    const total: LinkWriteStats = { items: 0, linked: 0, pending: 0, writes: 0, skippedManual: 0, skippedOutOfScope: 0, byStrategy: {} };
    const pendingCodes = new Set<string>();
    let invoices = 0;
    let cursor: string | null = null;

    for (;;) {
      const page: Array<{ id: string; number: string; senderCnpj: string; senderName: string; issueDate: Date; xmlContent: string }> =
        await prisma.invoice.findMany({
          where: { companyId: opts.companyId, type: 'NFE', direction: 'received', issueDate: { gte: since } },
          orderBy: { id: 'asc' },
          take: PAGE_SIZE,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          select: { id: true, number: true, senderCnpj: true, senderName: true, issueDate: true, xmlContent: true },
        });
      if (page.length === 0) break;

      for (const inv of page) {
        invoices++;
        const invoice = { id: inv.id, companyId: opts.companyId, senderCnpj: inv.senderCnpj, senderName: inv.senderName, xmlContent: inv.xmlContent };
        const rows = await decideInvoiceItems(invoice, index, memory);
        const stats = opts.diagnosticOnly
          ? statsFromRows(rows)
          : await writeInvoiceLinks(invoice, rows, { dryRun: opts.dryRun, force: opts.force });
        merge(total, stats);
        for (const row of rows) {
          if (row.decision?.productId) {
            if (row.decision.strategy !== 'S6') rememberDecision(memory, row.supplierCnpj, row.supplierCode, row.decision);
          } else if (!row.decision || !String(row.decision.strategy || '').startsWith('SKIPPED_')) {
            pendingCodes.add(`${row.supplierCnpj}::${row.supplierCode.toUpperCase()}`);
          }
          opts.onRow?.({ ...row, invoiceId: inv.id, invoiceNumber: inv.number, issueDate: inv.issueDate });
        }
      }
      cursor = page[page.length - 1].id;
      if (page.length < PAGE_SIZE) break;
    }

    const result: SweepResult = {
      companyId: opts.companyId,
      since: since.toISOString(),
      dryRun: Boolean(opts.dryRun || opts.diagnosticOnly),
      invoices,
      ...total,
      pendingDistinctCodes: pendingCodes.size,
      durationMs: Date.now() - startedAt,
    };
    log.info({ ...result, byStrategy: JSON.stringify(result.byStrategy) }, 'sweep finished');
    return result;
  } finally {
    await lock.release();
  }
}
