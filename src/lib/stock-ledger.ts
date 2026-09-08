/**
 * SPEC-056 — ledger de estoque (append-only).
 * Saldo = Σ IN − Σ OUT por produto + lote + validade + localização.
 */
import { randomUUID } from 'crypto';
import prisma from '@/lib/prisma';
import { getCfopTagByCode } from '@/lib/cfop';
import { extractProductsFromXml } from '@/lib/product-aggregation';
import { createLogger } from '@/lib/logger';
import {
  FISCAL_STOCK_KINDS,
  OPENING_STOCK_KIND,
  STOCK_LEDGER_CUTOFF,
  classifyReceivedStockCfop,
  computeImpliedOpenings,
  isOnOrAfterStockCutoff,
  resolveReceivedProductCodigo,
} from '@/lib/stock-ledger-cutoff';

export {
  STOCK_LEDGER_CUTOFF,
  isOnOrAfterStockCutoff,
  classifyReceivedStockCfop,
  resolveReceivedProductCodigo,
  computeImpliedOpenings,
  OPENING_STOCK_KIND,
};

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
  | 'SAIDA_AVULSA'
  | 'SALDO_INICIAL'
  | 'ESTORNO_CANCELAGEM';

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

/** Dia válido no mês (com ano bissexto) — rejeita 2026-13-01, 2026-02-30 etc. */
function isValidYmd(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1) return false;
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

/** Parseia validade comum em NF-e (YYYY-MM-DD, YYYYMMDD, DD/MM/YYYY). */
export function parseLotExpiry(raw?: string | null): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    // Sem esta checagem `new Date(Date.UTC(2026, 12, 1))` rolava para
    // jan/2027 e a faixa de validade ficava errada em silêncio.
    if (!isValidYmd(+m[1], +m[2], +m[3])) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m) {
    if (!isValidYmd(+m[1], +m[2], +m[3])) return null;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    if (!isValidYmd(+m[3], +m[2], +m[1])) return null;
    return new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
  }
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

  if (opts.limit === 0) return balances;
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

/** Monta a linha de movimento ENTRADA_NFE a partir de um nfeEntryItem. */
function entryItemToMovementRow(
  companyId: string,
  invoiceId: string,
  item: {
    id: number;
    itemNumber: number;
    codigoInterno?: string | null;
    supplierCode?: string | null;
    productName?: string | null;
    supplierDescription?: string | null;
    registryId?: string | null;
    lot?: string | null;
    lotExpiry?: string | null;
    lotSerial?: string | null;
    quantity?: number | string | null;
    lotQuantity?: number | string | null;
  },
  input: { occurredAt: Date; createdBy?: string | null; idempotencyKey?: string },
): StockMovementInput {
  const qty = Number(item.lotQuantity ?? item.quantity ?? 0);
  const codigo = (item.codigoInterno || item.supplierCode || `ITEM-${item.itemNumber}`).trim();
  return {
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
    createdBy: input.createdBy,
    occurredAt: input.occurredAt,
    idempotencyKey: input.idempotencyKey ?? `entrada-item:${item.id}`,
  };
}

export async function recordMovementsFromEntryItems(
  companyId: string,
  invoiceId: string,
  occurredAt: Date,
  createdBy?: string | null,
  opts: { replaceExisting?: boolean } = {},
): Promise<number> {
  if (opts.replaceExisting) {
    // BUG-002: re-registro recria os nfeEntryItem (deleteMany + insert) e o id
    // autoincrement muda — a chave `entrada-item:${id}` antiga nunca colidia e
    // cada re-registro duplicava a ENTRADA_NFE no saldo. Substituir a geração
    // anterior espelha exatamente a semântica do insertNfeEntryItems.
    await prisma.stockMovement.deleteMany({
      where: {
        companyId,
        invoiceId,
        kind: 'ENTRADA_NFE',
        idempotencyKey: { startsWith: 'entrada-item:' },
      },
    });
  }
  const items = await prisma.nfeEntryItem.findMany({
    where: { companyId, invoiceId },
  });
  const rows: StockMovementInput[] = [];
  for (const item of items) {
    const qty = Number(item.lotQuantity ?? item.quantity ?? 0);
    if (qty <= 0) continue;
    rows.push(entryItemToMovementRow(companyId, invoiceId, item, { occurredAt, createdBy }));
  }
  return recordStockMovements(rows);
}

/**
 * Espelha no ledger um único nfeEntryItem após edição (PATCH de lote, clone de
 * lote, exclusão de lote). Upsert pela chave canônica `entrada-item:${id}`;
 * quantidade ≤ 0 remove o movimento. Preserva occurredAt/createdBy originais
 * quando o movimento já existia.
 */
export async function syncEntryItemMovement(
  companyId: string,
  invoiceId: string,
  item: Parameters<typeof entryItemToMovementRow>[2],
): Promise<'created' | 'updated' | 'removed' | 'noop'> {
  const key = `entrada-item:${item.id}`;
  const qty = Number(item.lotQuantity ?? item.quantity ?? 0);
  const existing = await prisma.stockMovement.findFirst({
    where: { companyId, idempotencyKey: key },
    select: { id: true, occurredAt: true, createdBy: true },
  });

  if (qty <= 0) {
    if (!existing) return 'noop';
    await prisma.stockMovement.delete({ where: { id: existing.id } });
    return 'removed';
  }

  if (existing) {
    await prisma.stockMovement.update({
      where: { id: existing.id },
      data: {
        productCodigo: (item.codigoInterno || item.supplierCode || `ITEM-${item.itemNumber}`).trim(),
        productName: item.productName || item.supplierDescription || null,
        productRegistryId: item.registryId ?? null,
        lot: item.lot ?? '',
        lotExpiry: item.lotExpiry ?? null,
        lotSerial: item.lotSerial ?? null,
        quantity: qty,
      },
    });
    return 'updated';
  }

  await recordStockMovements([
    entryItemToMovementRow(companyId, invoiceId, item, { occurredAt: new Date() }),
  ]);
  return 'created';
}

export function classifyIssuedStockCfop(cfop: string | null | undefined): {
  kind: StockMovementKind;
  from: StockLocationType;
  to: StockLocationType | null;
} {
  const tag = getCfopTagByCode(cfop) ?? '';
  const code = (cfop ?? '').trim();
  // REQ-007 (SPEC-056): 511x/611x = venda a partir do consignado (consumido no
  // cliente). Inclui 5116/6116 (terceiros) e 5117/6117 (produção) — venda do
  // bem remetido anteriormente em consignação também sai do CUSTOMER, não do CD.
  if (
    [
      '5111', '6111', '5112', '6112', '5113', '6113', '5114', '6114', '5115', '6115',
      '5116', '6116', '5117', '6117',
    ].includes(code)
  ) {
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

export async function loadReceivedProductMaps(companyId: string): Promise<{
  registryByCode: Map<string, string>;
}> {
  const registries = await prisma.productRegistry.findMany({
    where: { companyId },
    select: { codigo: true, code: true },
  });
  const registryByCode = new Map<string, string>();
  for (const r of registries) {
    const codigo = (r.codigo || r.code || '').trim();
    if (!codigo) continue;
    if (r.codigo?.trim()) registryByCode.set(r.codigo.trim(), r.codigo.trim());
    if (r.code?.trim()) registryByCode.set(r.code.trim(), codigo);
  }
  return { registryByCode };
}

export async function recordMovementsFromReceivedInvoice(input: {
  companyId: string;
  invoiceId: string;
  xmlContent: string;
  cfop: string | null;
  senderCnpj: string | null;
  senderName: string | null;
  issueDate: Date;
  createdBy?: string | null;
  registryByCode?: Map<string, string>;
}): Promise<number> {
  if (!isOnOrAfterStockCutoff(input.issueDate)) return 0;
  const products = await extractProductsFromXml(input.xmlContent);
  if (products.length === 0) return 0;

  const links = await prisma.nfeItemProductLink.findMany({
    where: { companyId: input.companyId, invoiceId: input.invoiceId },
    select: { itemNumber: true, supplierCode: true, matchedCodigo: true },
  });

  const linkByItem = new Map<number, string>();
  const linkBySupplier = new Map<string, string>();
  for (const l of links) {
    if (l.matchedCodigo?.trim()) {
      linkByItem.set(l.itemNumber, l.matchedCodigo.trim());
      if (l.supplierCode) linkBySupplier.set(l.supplierCode.trim(), l.matchedCodigo.trim());
    }
  }
  const registryByCode = input.registryByCode ?? (await loadReceivedProductMaps(input.companyId)).registryByCode;

  const header = classifyReceivedStockCfop(input.cfop || products[0]?.cfop);
  const senderCnpj = input.senderCnpj;
  const rows: StockMovementInput[] = [];

  for (let i = 0; i < products.length; i++) {
    const p = products[i];
    const supplierCode = (p.code || '').trim();
    const codigo = resolveReceivedProductCodigo({
      supplierCode,
      itemNumber: p.nItem ?? i + 1,
      linkByItem,
      linkBySupplier,
      registryByCode,
    });
    if (!codigo) continue;
    const batches =
      p.batches && p.batches.length > 0
        ? p.batches.map((b) => ({
            lot: b.lot,
            lotExpiry: b.expiry,
            lotSerial: b.serial,
            quantity: b.quantity != null && b.quantity > 0 ? b.quantity : Number(p.quantity) || 0,
          }))
        : [{ lot: '', lotExpiry: null as string | null, lotSerial: null as string | null, quantity: Number(p.quantity) || 0 }];

    for (let bi = 0; bi < batches.length; bi++) {
      const b = batches[bi];
      if (b.quantity <= 0) continue;
      const base = {
        companyId: input.companyId,
        productCodigo: codigo,
        productName: p.description,
        lot: b.lot,
        lotExpiry: b.lotExpiry,
        lotSerial: b.lotSerial,
        quantity: b.quantity,
        invoiceId: input.invoiceId,
        createdBy: input.createdBy,
        occurredAt: input.issueDate,
      };
      if (header.isReturn) {
        const groupId = `xfer-recv:${input.invoiceId}:${i}:${bi}`;
        rows.push({
          ...base,
          direction: 'OUT',
          locationType: STOCK_LOCATION_CUSTOMER,
          locationCnpj: senderCnpj,
          locationName: input.senderName,
          kind: 'RETORNO_CONSIG',
          idempotencyKey: `received:${input.invoiceId}:item${i}:b${bi}:out`,
          transferGroupId: groupId,
        });
        rows.push({
          ...base,
          direction: 'IN',
          locationType: STOCK_LOCATION_CD,
          kind: 'RETORNO_CONSIG',
          idempotencyKey: `received:${input.invoiceId}:item${i}:b${bi}:in`,
          transferGroupId: groupId,
        });
      } else {
        rows.push({
          ...base,
          direction: 'IN',
          locationType: STOCK_LOCATION_CD,
          kind: 'ENTRADA_NFE',
          idempotencyKey: `received:${input.invoiceId}:item${i}:b${bi}`,
        });
      }
    }
  }
  return recordStockMovements(rows);
}

export async function seedImpliedOpenings(
  companyId: string,
  createdBy?: string | null,
): Promise<number> {
  await prisma.stockMovement.deleteMany({
    where: { companyId, kind: OPENING_STOCK_KIND },
  });
  const rows = await prisma.stockMovement.findMany({
    where: { companyId, kind: { not: OPENING_STOCK_KIND } },
    select: {
      productCodigo: true,
      lot: true,
      lotExpiry: true,
      locationType: true,
      locationCnpj: true,
      quantity: true,
      direction: true,
      occurredAt: true,
    },
  });
  const openings = computeImpliedOpenings(
    rows.map((r) => ({
      productCodigo: r.productCodigo,
      lot: r.lot,
      lotExpiry: r.lotExpiry,
      locationType: r.locationType,
      locationCnpj: r.locationCnpj,
      signedQty: r.direction === 'IN' ? Number(r.quantity) : -Number(r.quantity),
      occurredAt: r.occurredAt,
    })),
  );
  const inserted = await recordStockMovements(
    openings.map((o) => ({
      companyId,
      productCodigo: o.productCodigo,
      lot: o.lot,
      lotExpiry: o.lotExpiry,
      quantity: o.quantity,
      direction: 'IN' as const,
      locationType: o.locationType as StockLocationType,
      locationCnpj: o.locationCnpj,
      kind: OPENING_STOCK_KIND,
      reason: 'Saldo de abertura no corte 01/01/2021',
      createdBy,
      occurredAt: STOCK_LEDGER_CUTOFF,
      idempotencyKey: `opening:2021:${companyId}:${o.productCodigo}:${o.lot}:${o.lotExpiry ?? ''}:${o.locationType}:${o.locationCnpj ?? ''}`,
    })),
  );
  if (inserted > 0) log.info({ companyId, openings: inserted }, 'saldo inicial no corte');
  return inserted;
}

export async function backfillStockLedger(
  companyId: string,
  createdBy?: string | null,
): Promise<{ entries: number; issued: number; openings: number }> {
  let entries = 0;
  let issued = 0;

  // Não apaga o ledger fiscal inteiro: um POST HTTP que estoura timeout
  // deixava só as compras. Só limpa pré-corte e reabre o saldo inicial.
  await prisma.stockMovement.deleteMany({
    where: {
      companyId,
      OR: [
        { kind: { in: [...FISCAL_STOCK_KINDS] }, occurredAt: { lt: STOCK_LEDGER_CUTOFF } },
        { kind: OPENING_STOCK_KIND },
      ],
    },
  });

  const receivedInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'received',
      cancelledAt: null,
      xmlContent: { not: '' },
      issueDate: { gte: STOCK_LEDGER_CUTOFF },
    },
    select: {
      id: true,
      xmlContent: true,
      cfop: true,
      senderCnpj: true,
      senderName: true,
      issueDate: true,
    },
  });
  const { registryByCode } = await loadReceivedProductMaps(companyId);
  for (const inv of receivedInvoices) {
    if (!inv.xmlContent) continue;
    entries += await recordMovementsFromReceivedInvoice({
      companyId,
      invoiceId: inv.id,
      xmlContent: inv.xmlContent,
      cfop: inv.cfop,
      senderCnpj: inv.senderCnpj,
      senderName: inv.senderName,
      issueDate: inv.issueDate,
      createdBy,
      registryByCode,
    });
  }

  const issuedInvoices = await prisma.invoice.findMany({
    where: {
      companyId,
      type: 'NFE',
      direction: 'issued',
      cancelledAt: null,
      xmlContent: { not: '' },
      issueDate: { gte: STOCK_LEDGER_CUTOFF },
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
    if (!isOnOrAfterStockCutoff(inv.issueDate)) continue;
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

  const openings = await seedImpliedOpenings(companyId, createdBy);
  return { entries, issued, openings };
}
