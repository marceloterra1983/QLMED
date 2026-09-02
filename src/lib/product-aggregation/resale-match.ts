import { normalizeDescriptionToken, normalizeToken } from './shared';
import { normalizeUnit } from './units';

/**
 * Casamento de linha de revenda (Navix / Prime) com o produto do catálogo.
 *
 * Existiam DOIS algoritmos para a mesma pergunta (auditoria FISCAL-009):
 *  - o rebuild noturno indexava cada produto por código+unidade, EAN e
 *    descrição+unidade, e sondava nessa ordem (com o primeiro token da
 *    descrição como código alternativo);
 *  - a agregação incremental usava só `buildProductKey`, que devolve UMA chave
 *    por produto — então uma linha que só casava por EAN era simplesmente
 *    ignorada no incremental e deduzida no rebuild.
 *
 * Resultado: o estoque mudava sozinho depois do rebuild da madrugada. Este
 * módulo é a única fonte das chaves; os dois caminhos passaram a usá-lo.
 */
export interface ResaleMatchable {
  code?: string | null;
  unit?: string | null;
  ean?: string | null;
  description?: string | null;
}

function tokens(row: ResaleMatchable) {
  return {
    code: normalizeToken(row.code),
    unit: normalizeUnit(row.unit),
    ean: normalizeToken(row.ean).replace(/\D/g, ''),
    desc: normalizeDescriptionToken(row.description),
  };
}

/** Chaves sob as quais um produto do catálogo entra no índice. */
export function resaleIndexKeys(row: ResaleMatchable): string[] {
  const t = tokens(row);
  const keys: string[] = [];
  if (t.code && t.code !== '-') keys.push(`R_CODE_UNIT:${t.code}::${t.unit}`);
  if (t.ean && t.ean !== '0') keys.push(`R_EAN:${t.ean}`);
  if (t.desc && t.unit) keys.push(`R_DESC_UNIT:${t.desc}::${t.unit}`);
  return keys;
}

/** Chaves de sonda para uma linha de venda, na ordem de preferência. */
export function resaleLookupKeys(product: ResaleMatchable): string[] {
  const t = tokens(product);
  const keys: string[] = [];
  if (t.code && t.code !== '-') keys.push(`R_CODE_UNIT:${t.code}::${t.unit}`);

  // O emitente às vezes põe o código do fabricante no início da descrição em
  // vez do campo cProd.
  const firstToken = normalizeToken((product.description || '').split(/[\s\-]+/)[0]);
  if (firstToken && firstToken !== t.code) keys.push(`R_CODE_UNIT:${firstToken}::${t.unit}`);

  if (t.ean && t.ean !== '0') keys.push(`R_EAN:${t.ean}`);
  if (t.desc && t.unit) keys.push(`R_DESC_UNIT:${t.desc}::${t.unit}`);
  return keys;
}

/**
 * Índice do catálogo. Mantém o comportamento de `Map.set`: com chaves
 * repetidas, o último produto inserido ganha.
 */
export function buildResaleIndex<T>(
  rows: Iterable<T>,
  toMatchable: (row: T) => ResaleMatchable,
): Map<string, T> {
  const index = new Map<string, T>();
  for (const row of rows) {
    for (const key of resaleIndexKeys(toMatchable(row))) index.set(key, row);
  }
  return index;
}

export function matchResaleProduct<T>(
  index: Map<string, T>,
  product: ResaleMatchable,
): T | null {
  for (const key of resaleLookupKeys(product)) {
    const hit = index.get(key);
    if (hit !== undefined) return hit;
  }
  return null;
}
