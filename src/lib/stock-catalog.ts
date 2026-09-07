/**
 * SPEC-058 — catálogo de estoque: merge cadastro + saldos e árvore Linha>Grupo>Subgrupo.
 */

import type { StockBalanceRow, ValidityBand } from '@/lib/stock-ledger';

export interface StockCatalogProduct {
  productCodigo: string;
  code: string | null;
  description: string;
  productName: string;
  productType: string;
  productSubtype: string;
  productSubgroup: string | null;
  manufacturer: string | null;
  qtyCd: number;
  qtyCustomer: number;
  qtyTotal: number;
  worstValidity: ValidityBand | null;
  lots: StockBalanceRow[];
}

export interface StockSubgroupNode {
  key: string;
  name: string;
  products: StockCatalogProduct[];
}

export interface StockGroupNode {
  key: string;
  name: string;
  sameAsLine: boolean;
  subgroups: StockSubgroupNode[];
  loose: StockCatalogProduct[];
  products: StockCatalogProduct[];
}

export interface StockLineNode {
  key: string;
  name: string;
  groups: StockGroupNode[];
  products: StockCatalogProduct[];
}

export function stockLineKey(p: Pick<StockCatalogProduct, 'productType'>): string {
  return `line:${p.productType || 'Sem linha'}`;
}

export function stockGroupKey(
  p: Pick<StockCatalogProduct, 'productType' | 'productSubtype'>,
): string {
  return `group:${p.productType || 'Sem linha'}|${p.productSubtype || 'Sem grupo'}`;
}

export function stockSubgroupKey(
  p: Pick<StockCatalogProduct, 'productType' | 'productSubtype' | 'productSubgroup'>,
): string | null {
  const name = p.productSubgroup?.trim();
  if (!name) return null;
  return `sub:${p.productType || 'Sem linha'}|${p.productSubtype || 'Sem grupo'}|${name}`;
}

export function isStockGroupSameAsLine(
  p: Pick<StockCatalogProduct, 'productType' | 'productSubtype'>,
): boolean {
  return !!(p.productType && p.productSubtype) && p.productType === p.productSubtype;
}

const VALIDITY_RANK: Record<ValidityBand, number> = {
  vencido: 0,
  d30: 1,
  d90: 2,
  ok: 3,
  sem_validade: 4,
};

function worseValidity(a: ValidityBand | null, b: ValidityBand): ValidityBand {
  if (!a) return b;
  return VALIDITY_RANK[b] < VALIDITY_RANK[a] ? b : a;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function mergeCatalogWithBalances(
  catalog: Array<{
    codigo: string | null;
    code: string | null;
    description: string;
    productType: string | null;
    productSubtype: string | null;
    productSubgroup: string | null;
    manufacturerShortName: string | null;
    anvisaManufacturer: string | null;
    shortName: string | null;
  }>,
  balances: StockBalanceRow[],
  opts: { includeZero?: boolean; minQty?: number } = {},
): StockCatalogProduct[] {
  const includeZero = opts.includeZero ?? true;
  const minQty = opts.minQty ?? 0;
  const byCodigo = new Map<string, StockCatalogProduct>();

  for (const c of catalog) {
    const codigo = (c.codigo || c.code || '').trim();
    if (!codigo) continue;
    if (byCodigo.has(codigo)) continue;
    byCodigo.set(codigo, {
      productCodigo: codigo,
      code: c.code,
      description: c.description,
      productName: c.shortName || c.description,
      productType: c.productType?.trim() || 'Sem linha',
      productSubtype: c.productSubtype?.trim() || 'Sem grupo',
      productSubgroup: c.productSubgroup?.trim() || null,
      manufacturer: c.manufacturerShortName || c.anvisaManufacturer,
      qtyCd: 0,
      qtyCustomer: 0,
      qtyTotal: 0,
      worstValidity: null,
      lots: [],
    });
  }

  for (const b of balances) {
    const codigo = b.productCodigo.trim();
    if (!codigo) continue;
    let p = byCodigo.get(codigo);
    if (!p) {
      p = {
        productCodigo: codigo,
        code: null,
        description: b.productName || codigo,
        productName: b.productName || codigo,
        productType: 'Sem linha',
        productSubtype: 'Sem grupo',
        productSubgroup: null,
        manufacturer: null,
        qtyCd: 0,
        qtyCustomer: 0,
        qtyTotal: 0,
        worstValidity: null,
        lots: [],
      };
      byCodigo.set(codigo, p);
    }
    p.lots.push(b);
    if (b.locationType === 'CD') p.qtyCd += b.quantity;
    else p.qtyCustomer += b.quantity;
    if (b.quantity > 0) p.worstValidity = worseValidity(p.worstValidity, b.validityBand);
  }

  const out: StockCatalogProduct[] = [];
  for (const p of byCodigo.values()) {
    p.qtyCd = round3(p.qtyCd);
    p.qtyCustomer = round3(p.qtyCustomer);
    p.qtyTotal = round3(p.qtyCd + p.qtyCustomer);
    if (!includeZero && p.qtyTotal <= minQty) continue;
    if (includeZero && minQty > 0 && p.qtyTotal <= minQty) continue;
    out.push(p);
  }
  out.sort((a, b) => {
    const c = a.productType.localeCompare(b.productType, 'pt-BR');
    if (c !== 0) return c;
    const g = a.productSubtype.localeCompare(b.productSubtype, 'pt-BR');
    if (g !== 0) return g;
    return a.productName.localeCompare(b.productName, 'pt-BR');
  });
  return out;
}

export function filterStockProducts(
  products: StockCatalogProduct[],
  opts: {
    q?: string;
    locationType?: 'ALL' | 'CD' | 'CUSTOMER';
    validity?: ValidityBand | 'ALL';
    minQty?: number;
  } = {},
): StockCatalogProduct[] {
  const q = opts.q?.trim().toLowerCase();
  const minQty = opts.minQty ?? 0;
  return products.filter((p) => {
    if (opts.locationType === 'CD' && p.qtyCd <= minQty && minQty === 0 && opts.minQty != null) {
      /* keep zeros in Controle unless minQty asked */
    }
    if (opts.locationType === 'CD' && minQty > 0 && p.qtyCd <= 0) return false;
    if (opts.locationType === 'CUSTOMER' && minQty > 0 && p.qtyCustomer <= 0) return false;
    if (opts.minQty != null && opts.minQty > 0) {
      const qty =
        opts.locationType === 'CD'
          ? p.qtyCd
          : opts.locationType === 'CUSTOMER'
            ? p.qtyCustomer
            : p.qtyTotal;
      if (qty <= 0) return false;
    }
    if (opts.validity && opts.validity !== 'ALL') {
      if (!p.lots.some((l) => l.validityBand === opts.validity && l.quantity > 0)) return false;
    }
    if (q) {
      const hay = [
        p.productCodigo,
        p.code ?? '',
        p.description,
        p.productName,
        p.manufacturer ?? '',
        p.productType,
        p.productSubtype,
        p.productSubgroup ?? '',
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q) && !p.lots.some((l) => l.lot.toLowerCase().includes(q))) return false;
    }
    return true;
  });
}

export function buildStockProductTree(products: StockCatalogProduct[]): StockLineNode[] {
  const lines = new Map<string, StockLineNode>();
  const groups = new Map<string, StockGroupNode>();
  const subgroups = new Map<string, StockSubgroupNode>();

  for (const product of products) {
    const lineKey = stockLineKey(product);
    let line = lines.get(lineKey);
    if (!line) {
      line = { key: lineKey, name: product.productType || 'Sem linha', groups: [], products: [] };
      lines.set(lineKey, line);
    }
    line.products.push(product);

    const groupKey = stockGroupKey(product);
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        name: product.productSubtype || 'Sem grupo',
        sameAsLine: isStockGroupSameAsLine(product),
        subgroups: [],
        loose: [],
        products: [],
      };
      groups.set(groupKey, group);
      line.groups.push(group);
    }
    group.products.push(product);

    const subKey = stockSubgroupKey(product);
    if (!subKey) {
      group.loose.push(product);
      continue;
    }
    let sub = subgroups.get(subKey);
    if (!sub) {
      sub = { key: subKey, name: (product.productSubgroup || '').trim(), products: [] };
      subgroups.set(subKey, sub);
      group.subgroups.push(sub);
    }
    sub.products.push(product);
  }

  return Array.from(lines.values());
}

export function allStockCollapseKeys(products: StockCatalogProduct[]): Set<string> {
  const keys = new Set<string>();
  for (const p of products) {
    keys.add(stockLineKey(p));
    keys.add(stockGroupKey(p));
    const sub = stockSubgroupKey(p);
    if (sub) keys.add(sub);
  }
  return keys;
}

export const STOCK_FULL_EXPAND_LIMIT = 1000;

export function leafStockCollapseKeys(products: StockCatalogProduct[]): Set<string> {
  const keys = new Set<string>();
  for (const p of products) {
    const sub = stockSubgroupKey(p);
    if (sub) keys.add(sub);
    else if (!isStockGroupSameAsLine(p)) keys.add(stockGroupKey(p));
    else keys.add(stockLineKey(p));
  }
  return keys;
}

export function expandStockCollapseKeys(products: StockCatalogProduct[]): Set<string> {
  if (products.length <= STOCK_FULL_EXPAND_LIMIT) return new Set();
  return leafStockCollapseKeys(products);
}
