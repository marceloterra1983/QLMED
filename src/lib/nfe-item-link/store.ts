/**
 * SPEC-047 — persistência do vínculo item NF-e recebida → produto Spica.
 * Rotas e varredura delegam aqui; nada de DDL em runtime.
 */
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { createLogger } from '@/lib/logger';
import { extractProductsFromXml } from '@/lib/product-aggregation';
import {
  buildRegistryIndex,
  matchItem,
  memoryKey,
  type LinkItemInput,
  type LinkMemory,
  type MatchDecision,
  type MatchStrategy,
  type RegistryIndex,
  S6_AUTO_MIN_CONFIDENCE,
} from './match';
import { normalizeCnpj, normalizeSupplierCode } from './normalize';

const log = createLogger('nfe-item-link');

export const REGISTRY_INDEX_TTL_MS = 60_000;
const indexCache = new Map<string, { builtAt: number; index: RegistryIndex }>();

export function invalidateRegistryIndexCache(companyId?: string) {
  if (companyId) indexCache.delete(companyId);
  else indexCache.clear();
}

/** Catálogo indexado em memória; cache curto porque o ingest chama por nota. */
export async function loadRegistryIndex(companyId: string, opts: { fresh?: boolean } = {}): Promise<RegistryIndex> {
  const cached = indexCache.get(companyId);
  if (!opts.fresh && cached && Date.now() - cached.builtAt < REGISTRY_INDEX_TTL_MS) return cached.index;
  const rows = await prisma.productRegistry.findMany({
    where: { companyId },
    select: {
      id: true, codigo: true, code: true, productRefs: true, ean: true, anvisaCode: true,
      ncm: true, description: true, defaultSupplier: true, manufacturerShortName: true,
    },
  });
  const index = buildRegistryIndex(rows);
  indexCache.set(companyId, { builtAt: Date.now(), index });
  return index;
}

/**
 * Memória S6: por (CNPJ, cProd normalizado) o vínculo mais forte já gravado.
 * MANUAL ganha de qualquer automático; entre automáticos, o mais confiante.
 */
export async function loadLinkMemory(companyId: string): Promise<LinkMemory> {
  const rows = await prisma.nfeItemProductLink.findMany({
    where: {
      companyId,
      productRegistryId: { not: null },
      OR: [{ matchStrategy: 'MANUAL' }, { matchConfidence: { gte: S6_AUTO_MIN_CONFIDENCE } }],
    },
    select: { supplierCnpj: true, supplierCodeNorm: true, productRegistryId: true, matchStrategy: true, matchConfidence: true },
  });
  const memory: LinkMemory = new Map();
  for (const row of rows) {
    if (!row.productRegistryId) continue;
    rememberDecision(memory, row.supplierCnpj, row.supplierCodeNorm, {
      productId: row.productRegistryId,
      strategy: (row.matchStrategy || 'S6') as MatchStrategy,
      confidence: row.matchConfidence ?? 0,
    });
  }
  return memory;
}

export function rememberDecision(
  memory: LinkMemory,
  supplierCnpj: string,
  supplierCode: string,
  entry: { productId: string; strategy: MatchStrategy; confidence: number },
) {
  const key = memoryKey(supplierCnpj, supplierCode);
  const current = memory.get(key);
  if (!current) { memory.set(key, entry); return; }
  if (current.strategy === 'MANUAL') return;
  if (entry.strategy === 'MANUAL' || entry.confidence > current.confidence) memory.set(key, entry);
}

export interface InvoiceForLink {
  id: string;
  companyId: string;
  senderCnpj: string;
  senderName: string | null;
  xmlContent: string;
}

export interface ItemLinkRow extends LinkItemInput {
  itemNumber: number;
  unit: string | null;
  decision: MatchDecision | null;
}

/** Extrai os itens do XML já com a decisão da cascata (sem escrever). */
export async function decideInvoiceItems(
  invoice: InvoiceForLink,
  index: RegistryIndex,
  memory: LinkMemory,
): Promise<ItemLinkRow[]> {
  const products = await extractProductsFromXml(invoice.xmlContent);
  const rows: ItemLinkRow[] = [];
  const seen = new Set<number>();
  products.forEach((p, idx) => {
    let itemNumber = p.nItem ?? idx + 1;
    while (seen.has(itemNumber)) itemNumber += 1000; // nItem duplicado no XML: não perder linha
    seen.add(itemNumber);
    const input: LinkItemInput = {
      supplierCnpj: normalizeCnpj(invoice.senderCnpj),
      supplierName: invoice.senderName,
      supplierCode: p.code === '-' ? '' : p.code,
      description: p.description,
      ean: p.ean,
      anvisa: p.anvisa,
      ncm: p.ncm,
    };
    const decision = input.supplierCode || input.ean || input.anvisa
      ? matchItem(input, index, memory)
      : null;
    rows.push({ ...input, itemNumber, unit: p.unit === '-' ? null : p.unit, decision });
  });
  return rows;
}

export interface LinkWriteStats {
  items: number;
  linked: number;
  pending: number;
  writes: number;
  skippedManual: number;
  byStrategy: Record<string, number>;
}

function emptyStats(): LinkWriteStats {
  return { items: 0, linked: 0, pending: 0, writes: 0, skippedManual: 0, byStrategy: {} };
}

/**
 * Grava as decisões de uma nota. Idempotente: linha igual não é reescrita;
 * MANUAL nunca é tocado; `force` reavalia automáticos já vinculados.
 */
export async function writeInvoiceLinks(
  invoice: InvoiceForLink,
  rows: ItemLinkRow[],
  opts: { dryRun?: boolean; force?: boolean; matchedBy?: string } = {},
): Promise<LinkWriteStats> {
  const stats = emptyStats();
  stats.items = rows.length;
  if (rows.length === 0) return stats;

  const existing = await prisma.nfeItemProductLink.findMany({
    where: { companyId: invoice.companyId, invoiceId: invoice.id },
    select: { id: true, itemNumber: true, productRegistryId: true, matchStrategy: true, matchConfidence: true },
  });
  const byItem = new Map(existing.map((e) => [e.itemNumber, e]));
  const now = new Date();
  const ops: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of rows) {
    const current = byItem.get(row.itemNumber);
    const strategy = row.decision?.strategy ?? null;
    if (row.decision) {
      stats.linked++;
      stats.byStrategy[row.decision.strategy] = (stats.byStrategy[row.decision.strategy] || 0) + 1;
    } else {
      stats.pending++;
    }

    if (current?.matchStrategy === 'MANUAL') { stats.skippedManual++; continue; }

    const unchanged = current
      && current.productRegistryId === (row.decision?.productId ?? null)
      && current.matchStrategy === strategy;
    if (unchanged) continue;
    // Já vinculado automaticamente e sem `force`: não reescreve (idempotência
    // barata); com `force` reavalia e pode trocar/limpar.
    if (current && current.productRegistryId && !opts.force && !row.decision) continue;

    stats.writes++;
    if (opts.dryRun) continue;

    const data = {
      supplierCnpj: row.supplierCnpj,
      supplierCode: row.supplierCode,
      supplierCodeNorm: normalizeSupplierCode(row.supplierCode),
      supplierDescription: row.description,
      ean: row.ean,
      anvisa: row.anvisa,
      ncm: row.ncm,
      unit: row.unit,
      productRegistryId: row.decision?.productId ?? null,
      matchedCodigo: row.decision?.codigo ?? null,
      matchStrategy: strategy,
      matchConfidence: row.decision?.confidence ?? null,
      matchedAt: row.decision ? now : null,
      matchedBy: row.decision ? (opts.matchedBy ?? 'system') : null,
      updatedAt: now,
    };
    if (current) {
      ops.push(prisma.nfeItemProductLink.update({ where: { id: current.id }, data }));
    } else {
      ops.push(prisma.nfeItemProductLink.create({
        data: { id: randomUUID(), companyId: invoice.companyId, invoiceId: invoice.id, itemNumber: row.itemNumber, ...data },
      }));
    }
  }

  if (ops.length > 0) await prisma.$transaction(ops);
  return stats;
}

/**
 * Ponto de entrada do ingest (uma nota). Carrega índice (cache) e memória,
 * decide e grava. Falhas são do chamador conter.
 */
export async function linkInvoiceItems(
  invoice: InvoiceForLink,
  opts: { dryRun?: boolean; force?: boolean; index?: RegistryIndex; memory?: LinkMemory } = {},
): Promise<LinkWriteStats> {
  const index = opts.index ?? await loadRegistryIndex(invoice.companyId);
  if (index.size === 0) return emptyStats();
  const memory = opts.memory ?? await loadLinkMemory(invoice.companyId);
  const rows = await decideInvoiceItems(invoice, index, memory);
  const stats = await writeInvoiceLinks(invoice, rows, opts);
  for (const row of rows) {
    if (row.decision && row.decision.strategy !== 'S6') {
      rememberDecision(memory, row.supplierCnpj, row.supplierCode, row.decision);
    }
  }
  return stats;
}

/**
 * Vínculo MANUAL: ou um item (linkId) ou o grupo inteiro (CNPJ + cProd). O
 * grupo é o que ensina o sistema (S6) para notas futuras.
 */
export async function setManualLink(params: {
  companyId: string;
  userId: string;
  productRegistryId: string;
  linkId?: string;
  supplierCnpj?: string;
  supplierCode?: string;
}): Promise<{ updated: number; codigo: string | null }> {
  const product = await prisma.productRegistry.findFirst({
    where: { id: params.productRegistryId, companyId: params.companyId },
    select: { id: true, codigo: true },
  });
  if (!product) throw new Error('PRODUCT_NOT_FOUND');

  const where: Prisma.NfeItemProductLinkWhereInput = { companyId: params.companyId };
  if (params.linkId) {
    where.id = params.linkId;
  } else if (params.supplierCnpj && params.supplierCode !== undefined) {
    where.supplierCnpj = normalizeCnpj(params.supplierCnpj);
    where.supplierCodeNorm = normalizeSupplierCode(params.supplierCode);
  } else {
    throw new Error('SCOPE_REQUIRED');
  }

  const now = new Date();
  const result = await prisma.nfeItemProductLink.updateMany({
    where,
    data: {
      productRegistryId: product.id,
      matchedCodigo: product.codigo,
      matchStrategy: 'MANUAL',
      matchConfidence: 1,
      matchedAt: now,
      matchedBy: params.userId,
      updatedAt: now,
    },
  });
  log.info({ companyId: params.companyId, updated: result.count, codigo: product.codigo }, 'manual link');
  return { updated: result.count, codigo: product.codigo };
}

export interface PendingGroup {
  supplierCnpj: string;
  supplierName: string | null;
  supplierCode: string;
  description: string | null;
  ncm: string | null;
  itemCount: number;
  invoiceCount: number;
  lastIssueDate: string | null;
  sampleLinkId: string;
}

/** Pendências agrupadas por fornecedor + cProd normalizado. */
export async function listPendingGroups(params: {
  companyId: string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ groups: PendingGroup[]; totalGroups: number; totalItems: number }> {
  const limit = Math.min(Math.max(params.limit ?? 50, 1), 500);
  const offset = Math.max(params.offset ?? 0, 0);
  const search = (params.search || '').trim();
  const searchSql = search
    ? Prisma.sql`AND (l.supplier_code ILIKE ${'%' + search + '%'} OR l.supplier_description ILIKE ${'%' + search + '%'} OR i."senderName" ILIKE ${'%' + search + '%'} OR l.supplier_cnpj LIKE ${'%' + search.replace(/\D/g, '') + '%'})`
    : Prisma.empty;

  const groups = await prisma.$queryRaw<Array<{
    supplier_cnpj: string; supplier_name: string | null; supplier_code: string; description: string | null;
    ncm: string | null; item_count: bigint; invoice_count: bigint; last_issue_date: Date | null; sample_link_id: string;
  }>>(Prisma.sql`
    SELECT l.supplier_cnpj,
           max(i."senderName") AS supplier_name,
           min(l.supplier_code) AS supplier_code,
           max(l.supplier_description) AS description,
           max(l.ncm) AS ncm,
           count(*)::bigint AS item_count,
           count(DISTINCT l.invoice_id)::bigint AS invoice_count,
           max(i."issueDate") AS last_issue_date,
           min(l.id) AS sample_link_id
    FROM nfe_item_product_link l
    JOIN "Invoice" i ON i.id = l.invoice_id
    WHERE l.company_id = ${params.companyId} AND l.product_registry_id IS NULL ${searchSql}
    GROUP BY l.supplier_cnpj, l.supplier_code_norm
    ORDER BY item_count DESC, last_issue_date DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const totals = await prisma.$queryRaw<Array<{ total_groups: bigint; total_items: bigint }>>(Prisma.sql`
    SELECT count(*)::bigint AS total_groups, coalesce(sum(n), 0)::bigint AS total_items
    FROM (
      SELECT count(*) AS n
      FROM nfe_item_product_link l
      JOIN "Invoice" i ON i.id = l.invoice_id
      WHERE l.company_id = ${params.companyId} AND l.product_registry_id IS NULL ${searchSql}
      GROUP BY l.supplier_cnpj, l.supplier_code_norm
    ) g
  `);

  return {
    groups: groups.map((g) => ({
      supplierCnpj: g.supplier_cnpj,
      supplierName: g.supplier_name,
      supplierCode: g.supplier_code,
      description: g.description,
      ncm: g.ncm,
      itemCount: Number(g.item_count),
      invoiceCount: Number(g.invoice_count),
      lastIssueDate: g.last_issue_date ? g.last_issue_date.toISOString() : null,
      sampleLinkId: g.sample_link_id,
    })),
    totalGroups: Number(totals[0]?.total_groups ?? 0),
    totalItems: Number(totals[0]?.total_items ?? 0),
  };
}

export async function countPendingItems(companyId: string): Promise<number> {
  return prisma.nfeItemProductLink.count({ where: { companyId, productRegistryId: null } });
}

/** Vínculos de uma nota, para a aba Produtos do detalhe. */
export async function listInvoiceLinks(companyId: string, invoiceId: string) {
  return prisma.nfeItemProductLink.findMany({
    where: { companyId, invoiceId },
    select: {
      id: true, itemNumber: true, supplierCnpj: true, supplierCode: true, productRegistryId: true,
      matchedCodigo: true, matchStrategy: true, matchConfidence: true,
      productRegistry: { select: { description: true, code: true } },
    },
    orderBy: { itemNumber: 'asc' },
  });
}
