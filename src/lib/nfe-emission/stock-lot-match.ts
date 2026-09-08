/**
 * SPEC-065 — identidade do produto no picker de lote CD.
 * O ledger grava productCodigo como codigo interno; a emissão manda cProd (code).
 */

export type StockLotIdentityFields = {
  productCodigo?: string | null;
  code?: string | null;
  codigo?: string | null;
};

export function normalizeStockLotProductKey(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

export function expandStockLotProductKeys(
  ...groups: Array<string | StockLotIdentityFields | null | undefined>
): string[] {
  const keys = new Set<string>();
  const add = (value: string | null | undefined) => {
    const token = normalizeStockLotProductKey(value);
    if (token) keys.add(token);
  };
  for (const group of groups) {
    if (group == null) continue;
    if (typeof group === 'string') {
      add(group);
      continue;
    }
    add(group.productCodigo);
    add(group.code);
    add(group.codigo);
  }
  return [...keys];
}

export function stockLotProductMatches(
  productCodigo: string,
  keys: readonly string[],
): boolean {
  const token = normalizeStockLotProductKey(productCodigo);
  if (!token) return false;
  const set = new Set(keys.map(normalizeStockLotProductKey).filter(Boolean));
  return set.has(token);
}

export function filterStockLotsForProduct<T extends { productCodigo: string; quantity?: number }>(
  balances: readonly T[],
  query: string,
  catalog?: StockLotIdentityFields | StockLotIdentityFields[] | null,
): T[] {
  const identities = catalog == null ? [] : Array.isArray(catalog) ? catalog : [catalog];
  const keys = expandStockLotProductKeys(query, ...identities);
  if (keys.length === 0) return [];
  return balances.filter((row) => {
    if (row.quantity != null && !(row.quantity > 0)) return false;
    return stockLotProductMatches(row.productCodigo, keys);
  });
}
