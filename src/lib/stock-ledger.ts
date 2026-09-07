/**
 * SPEC-056 — ledger de estoque (append-only).
 * Saldo = Σ IN − Σ OUT por produto + lote + validade + localização.
 */
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { getCfopTagByCode } from '@/lib/cfop';
import { extractProductsFromXml } from '@/lib/product-aggregation';
import { createLogger } from '@/lib/logger';

const log = createLogger('stock-ledger');

export const STOCK_LOCATION_CD = 'CD' as const;
export const STOCK_LOCATION_CUSTOMER = 'CUSTOMER' as const;

export type StockDirection = 'IN' | 'OUT';
export type StockLocationType = typeof STOCK_LOCATION_CD | typeof STOCK_LOCATION_CUSTOMER;
export type StockMovementKind =
  | 'ENTRADA_NFE'
  | 'SAIDA_NFE'
  | 'REMESSA_CONSIG'
  | 'RETORNO_CONSIG'
  | 'PERDA_VALIDADE'
  | 'AJUSTE'
  | 'SAIDA_AVULSA';

export type ValidityBand = 'vencido' | 'd30' | 'd90' | 'ok' | 'sem_validade';

export interface StockMovementInput {
  companyId: string;
  productCodigo: string;
  productName?: string | null;
  productRegistryId?: string | null;
  lot?: string | null;
  lotExpiry?: string | null;
  lotSerial?: string | null;
  quantity: number;
  direction: StockDirection;
  locationType: StockLocationType;
  locationCnpj?: string | null;
  locationName?: string | null;
  kind: StockMovementKind;
  invoiceId?: string | null;
  nfeEntryItemId?: number | null;
  reason?: string | null;
  createdBy?: string | null;
  occurredAt: Date;
  idempotencyKey: string;
  transferGroupId?: string | null;
}

export interface StockBalanceRow {
  productCodigo: string;
  productName: string | null;
  lot: string;
  lotExpiry: string | null;
  locationType: StockLocationType;
  locationCnpj: string | null;
  locationName: string | null;
  quantity: number;
  validityBand: ValidityBand;
  daysToExpiry: number | null;
}

function normalizeLot(lot?: string | null): string {
  return (lot ?? '').trim();
}

function normalizeCnpj(cnpj?: string | null): string | null {
  if (!cnpj) return null;
  const digits = cnpj.replace(/\D/g, '');
  return digits.length ? digits : null;
}

/** Parseia validade comum em NF-e (YYYY-MM-DD, YYYYMMDD, DD/MM/YYYY). */
export function parseLotExpiry(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function validityBand(expiry?: string | null, now = new Date()): ValidityBand {
  const d = parseLotExpiry(expiry);
  if (!d) return 'sem_validade';
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startExp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((startExp - startToday) / 86_400_000);
  if (days < 0) return 'vencido';
  if (days <= 30) return 'd30';
  if (days <= 90) return 'd90';
  return 'ok';
}

export function daysToExpiry(expiry?: string | null, now = new Date()): number | null {
  const d = parseLotExpiry(expiry);
  if (!d) return null;
  const startToday = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const startExp = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.floor((startExp - startToday) / 86_400_000);
}

export async function recordStockMovements(rows: StockMovementInput[]): Promise<number> {
  if (rows.length === 0) return 0;
  const data = rows
    .filter((r) => r.quantity > 0 && r.productCodigo.trim())
    .map((r) => ({
      id: randomUUID(),
      companyId: r.companyId,
      productCodigo: r.productCodigo.trim(),
      productName: r.productName ?? null,
      productRegistryId: r.productRegistryId ?? null,
      lot: normalizeLot(r.lot),
      lotExpiry: r.lotExpiry?.trim() || null,
      lotSerial: r.lotSerial?.trim() || null,
      quantity: r.quantity,
      direction: r.direction,
      locationType: r.locationType,
      locationCnpj: normalizeCnpj(r.locationCnpj),
      locationName: r.locationName ?? null,
      kind: r.kind,
      invoiceId: r.invoiceId ?? null,
      nfeEntryItemId: r.nfeEntryItemId ?? null,
      reason: r.reason ?? null,
      createdBy: r.createdBy ?? null,
      occurredAt: r.occurredAt,
      idempotencyKey: r.idempotencyKey,
      transferGroupId: r.transferGroupId ?? null,
    }));
  if (data.length === 0) return 0;
  const result = await prisma.stockMovement.createMany({
    data,
    skipDuplicates: true,
  });
  return result.count;
}

export async function listStockBalances(
  companyId: string,
  opts: {
    q?: string;
    locationType?: StockLocationType | 'ALL';
    validity?: ValidityBand | 'ALL';
    limit?: number;
  } = {},
): Promise<StockBalanceRow[]> {
  const rows = await prisma.stockMovement.findMany({
    where: { companyId },
    select: {
      productCodigo: true,
      productName: true,
      lot: true,
      lotExpiry: true,
      locationType: true,
      locationCnpj: true,
      locationName: true,
      quantity: true,
      direction: true,
    },
  });

  type Agg = {
    productCodigo: string;
    productName: string | null;
    lot: string;
    lotExpiry: string | null;
    locationType: StockLocationType;
    locationCnpj: string | null;
    locationName: string | null;
    quantity: number;
  };

  const map = new Map<string, Agg>();
  for (const r of rows) {
    const key = [r.productCodigo, r.lot, r.lotExpiry ?? '', r.locationType, r.locationCnpj ?? ''].join('|');
    let agg = map.get(key);
    if (!agg) {
      agg = {
        productCodigo: r.productCodigo,
        productName: r.productName,
        lot: r.lot,
        lotExpiry: r.lotExpiry,
        locationType: r.locationType as StockLocationType,
        locationCnpj: r.locationCnpj,
        locationName: r.locationName,
        quantity: 0,
      };
      map.set(key, agg);
    }
    const signed = r.direction === 'IN' ? Number(r.quantity) : -Number(r.quantity);
    agg.quantity += signed;
    if (!agg.productName && r.productName) agg.productName = r.productName;
    if (!agg.locationName && r.locationName) agg.locationName = r.locationName;
  }

  let balances = Array.from(map.values())
    .filter((b) => Math.abs(b.quantity) > 1e-9)
    .map((b) => ({
      ...b,
      quantity: Math.round(b.quantity * 1000) / 1000,
      validityBand: validityBand(b.lotExpiry),
      daysToExpiry: daysToExpiry(b.lotExpiry),
    }));

  if (opts.locationType && opts.locationType !== 'ALL') {
    balances = balances.filter((b) => b.locationType === opts.locationType);
  }
  if (opts.validity && opts.validity !== 'ALL') {
    balances = balances.filter((b) => b.validityBand === opts.validity);
  }
  if (opts.q?.trim()) {
    const q = opts.q.trim().toLowerCase();
    balances = balances.filter(
      (b) =>
        b.productCodigo.toLowerCase().includes(q) ||
        (b.productName ?? '').toLowerCase().includes(q) ||
        b.lot.toLowerCase().includes(q) ||
        (b.locationCnpj ?? '').includes(q) ||
        (b.locationName ?? '').toLowerCase().includes(q),
    );
  }

  balances.sort((a, b) => {
    const da = a.daysToExpiry;
    const db = b.daysToExpiry;
    if (da == null && db == null) return a.productCodigo.localeCompare(b.productCodigo);
    if (da == null) return 1;
    if (db == null) return -1;
    if (da !== db) return da - db;
    return a.productCodigo.localeCompare(b.productCodigo);
  });

  return balances.slice(0, opts.limit ?? 500);
}

export async function allocateLotsFefo(
  companyId: string,
  productCodigo: string,
  locationType: StockLocationType,
  locationCnpj: string | null,
  quantity: number,
): Promise<Array<{ lot: string; lotExpiry: string | null; quantity: number }>> {
  const balances = await listStockBalances(companyId, { locationType });
  const cnpj = normalizeCnpj(locationCnpj);
  const eligible = balances.filter(
    (b) =>
      b.productCodigo === productCodigo &&
      b.quantity > 0 &&
      b.locationType === locationType &&
      (locationType === STOCK_LOCATION_CD || b.locationCnpj === cnpj),
  );
  let remaining = quantity;
  const out: Array<{ lot: string; lotExpiry: string | null; quantity: number }> = [];
  for (const b of eligible) {
    if (remaining <= 0) break;
    const take = Math.min(b.quantity, remaining);
    out.push({ lot: b.lot, lotExpiry: b.lotExpiry, quantity: take });
    remaining -= take;
  }
  if (remaining > 1e-9) {
    out.push({ lot: '', lotExpiry: null, quantity: remaining });
  }
  return out;
}

export async function recordMovementsFromEntryItems(
  companyId: string,
  invoiceId: string,
  occurredAt: Date,
  createdBy?: string | null,
): Promise<number> {
  const items = await prisma.nfeEntryItem.findMany({
    where: { companyId, invoiceId },
  });
  const rows: StockMovementInput[] = [];
  for (const item of items) {
    const qty = Number(item.lotQuantity ?? item.quantity ?? 0);
    if (qty <= 0) continue;
    const codigo = (item.codigoInterno || item.supplierCode || `ITEM-${item.itemNumber}`).trim();
    rows.push({
      companyId,
      productCodigo: codigo,
      productName: item.productName || item.supplierDescription,
      productRegistryId: item.registryId,
      lot: item.lot,
      lotExpiry: item.lotExpiry,
      lotSerial: item.lotSerial,
      quantity: qty,
      direction: 'IN',
      locationType: STOCK_LOCATION_CD,
      kind: 'ENTRADA_NFE',
      invoiceId,
      nfeEntryItemId: item.id,
      createdBy,
      occurredAt,
      idempotencyKey: `entrada-item:${item.id}`,
    });
  }
  return recordStockMovements(rows);
}

export function classifyIssuedStockCfop(cfop: string | null | undefined): {
  kind: StockMovementKind;
  from: StockLocationType;
  to: StockLocationType | null;
} {
  const tag = getCfopTagByCode(cfop) ?? '';
  const code = (cfop ?? '').trim();
  if (['5114', '6114', '5115', '6115', '5113', '6113', '5111', '6111', '5112', '6112'].includes(code)) {
    return { kind: 'SAIDA_NFE', from: STOCK_LOCATION_CUSTOMER, to: null };
  }
  if (tag === 'Consignação' || code === '5917' || code === '6917') {
    return { kind: 'REMESSA_CONSIG', from: STOCK_LOCATION_CD, to: STOCK_LOCATION_CUSTOMER };
  }
  if (
    tag === 'Retorno Consig.' ||
    tag === 'Dev. Consig.' ||
    ['1918', '2918', '5916', '6916', '1916', '2916'].includes(code)
  ) {
    if (code.startsWith('1') || code.startsWith('2')) {
      return { kind: 'RETORNO_CONSIG', from: STOCK_LOCATION_CUSTOMER, to: STOCK_LOCATION_CD };
    }
    return { kind: 'SAIDA_NFE', from: STOCK_LOCATION_CD, to: null };
  }
  return { kind: 'SAIDA_NFE', from: STOCK_LOCATION_CD, to: null };
}

export async function recordMovementsFromIssuedInvoice(input: {
  companyId: string;
  invoiceId: string;
  xmlContent: string;
  cfop: string | null;
  recipientCnpj: string | null;
  recipientName: string | null;
  issueDate: Date;
  createdBy?: string | null;
}): Promise<number> {
  const products = await extractProductsFromXml(input.xmlContent);
  const header = classifyIssuedStockCfop(input.cfop || products[0]?.cfop);
  const customerCnpj = normalizeCnpj(input.recipientCnpj);
  const rows: StockMovementInput[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const codigo = (p.code || `ITEM-${i + 1}`).trim();
    const batches =
      p.batches && p.batches.length > 0
        ? p.batches.map((b) => ({
            lot: b.lot,
            lotExpiry: b.expiry,
            quantity: b.quantity != null && b.quantity > 0 ? b.quantity : Number(p.quantity) || 0,
          }))
        : [{ lot: '', lotExpiry: null as string | null, quantity: Number(p.quantity) || 0 }];

    for (let bi = 0; bi < batches.length; bi++) {
      const b = batches[bi];
      if (b.quantity <= 0) continue;
      let allocations = [{ lot: b.lot || '', lotExpiry: b.lotExpiry, quantity: b.quantity }];
      if (!b.lot) {
        allocations = await allocateLotsFefo(
          input.companyId,
          codigo,
          header.from,
          header.from === STOCK_LOCATION_CUSTOMER ? customerCnpj : null,
          b.quantity,
        );
      }

      for (let ai = 0; ai < allocations.length; ai++) {
        const a = allocations[ai];
        const groupId = header.to != null ? `xfer:${input.invoiceId}:${i}:${bi}:${ai}` : null;
        const baseKey = `issued:${input.invoiceId}:item${i}:b${bi}:a${ai}`;

        rows.push({
          companyId: input.companyId,
          productCodigo: codigo,
          productName: p.description,
          lot: a.lot,
          lotExpiry: a.lotExpiry,
          quantity: a.quantity,
          direction: 'OUT',
          locationType: header.from,
          locationCnpj: header.from === STOCK_LOCATION_CUSTOMER ? customerCnpj : null,
          locationName: header.from === STOCK_LOCATION_CUSTOMER ? input.recipientName : null,
          kind: header.kind,
          invoiceId: input.invoiceId,
          createdBy: input.createdBy,
          occurredAt: input.issueDate,
          idempotencyKey: `${baseKey}:out`,
          transferGroupId: groupId,
        });

        if (header.to === STOCK_LOCATION_CUSTOMER) {
          rows.push({
            companyId: input.companyId,
            productCodigo: codigo,
            productName: p.description,
            lot: a.lot,
            lotExpiry: a.lotExpiry,
            quantity: a.quantity,
            direction: 'IN',
            locationType: STOCK_LOCATION_CUSTOMER,
            locationCnpj: customerCnpj,
            locationName: input.recipientName,
            kind: header.kind,
            invoiceId: input.invoiceId,
            createdBy: input.createdBy,
            occurredAt: input.issueDate,
            idempotencyKey: `${baseKey}:in`,
            transferGroupId: groupId,
          });
        } else if (header.to === STOCK_LOCATION_CD) {
          rows.push({
            companyId: input.companyId,
            productCodigo: codigo,
            productName: p.description,
            lot: a.lot,
            lotExpiry: a.lotExpiry,
            quantity: a.quantity,
            direction: 'IN',
            locationType: STOCK_LOCATION_CD,
            kind: header.kind,
            invoiceId: input.invoiceId,
            createdBy: input.createdBy,
            occurredAt: input.issueDate,
            idempotencyKey: `${baseKey}:in`,
            transferGroupId: groupId,
          });
        }
      }
    }
  }

  const n = await recordStockMovements(rows);
  if (n > 0) log.info({ invoiceId: input.invoiceId, movements: n }, 'issued stock movements');
  return n;
}

export async function recordManualMovement(input: {
  companyId: string;
  productCodigo: string;
  productName?: string | null;
  lot: string;
  lotExpiry?: string | null;
  quantity: number;
  kind: 'PERDA_VALIDADE' | 'AJUSTE';
  direction: StockDirection;
  locationType: StockLocationType;
  locationCnpj?: string | null;
  locationName?: string | null;
  reason: string;
  createdBy: string;
}): Promise<number> {
  if (!input.reason.trim()) throw new Error('Motivo obrigatório');
  if (input.quantity <= 0) throw new Error('Quantidade inválida');
  if (input.kind === 'PERDA_VALIDADE' && input.direction !== 'OUT') {
    throw new Error('Perda por validade deve ser saída');
  }
  const key = `manual:${input.kind}:${input.companyId}:${input.productCodigo}:${normalizeLot(input.lot)}:${input.locationType}:${normalizeCnpj(input.locationCnpj) ?? 'CD'}:${input.direction}:${input.quantity}:${Date.now()}:${randomUUID()}`;
  return recordStockMovements([
    {
      companyId: input.companyId,
      productCodigo: input.productCodigo,
      productName: input.productName,
      lot: input.lot,
      lotExpiry: input.lotExpiry,
      quantity: input.quantity,
      direction: input.direction,
      locationType: input.locationType,
      locationCnpj: input.locationCnpj,
      locationName: input.locationName,
      kind: input.kind,
      reason: input.reason.trim(),
      createdBy: input.createdBy,
      occurredAt: new Date(),
      idempotencyKey: key,
    },
  ]);
}

export async function backfillStockLedger(
  companyId: string,
  createdBy?: string | null,
): Promise<{ entries: number; issued: number }> {
  let entries = 0;
  let issued = 0;

  const stockEntries = await prisma.stockEntry.findMany({
    where: { companyId, status: { in: ['registered', 'partial'] } },
    select: { invoiceId: true, registeredAt: true, issueDate: true },
  });
  for (const se of stockEntries) {
    entries += await recordMovementsFromEntryItems(
      companyId,
      se.invoiceId,
      se.registeredAt ?? se.issueDate ?? new Date(),
      createdBy,
    );
  }

  const issuedInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'issued',
      cancelledAt: null,
      xmlContent: { not: '' },
    },
    select: {
      id: true,
      xmlContent: true,
      cfop: true,
      recipientCnpj: true,
      recipientName: true,
      issueDate: true,
    },
  });
  for (const inv of issuedInvoices) {
    if (!inv.xmlContent) continue;
    issued += await recordMovementsFromIssuedInvoice({
      companyId,
      invoiceId: inv.id,
      xmlContent: inv.xmlContent,
      cfop: inv.cfop,
      recipientCnpj: inv.recipientCnpj,
      recipientName: inv.recipientName,
      issueDate: inv.issueDate ?? new Date(),
      createdBy,
    });
  }

  return { entries, issued };
}
