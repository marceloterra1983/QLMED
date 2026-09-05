import type { ProductRow, SortField } from '../types';

/**
 * Acima deste total de produtos, "Expandir" e a busca abrem só até o último
 * nível de agrupamento. Renderizar milhares de <tr> (desktop + mobile) trava a
 * página; o catálogo inteiro (~8k) chega de uma vez na hierarquia.
 */
export const FULL_EXPAND_LIMIT = 1000;

/** Chave de linha no Set collapsedGroups (hierarquia productType). */
export function productLineKey(product: Pick<ProductRow, 'productType'>): string {
  return `line:${product.productType || 'Sem linha'}`;
}

/** Chave de subgrupo no Set collapsedGroups (hierarquia productType). */
export function productSubgroupKey(
  product: Pick<ProductRow, 'productType' | 'productSubtype' | 'productSubgroup'>,
): string | null {
  const name = product.productSubgroup?.trim();
  if (!name) return null;
  return `sub:${product.productType || 'Sem linha'}|${product.productSubtype || 'Sem grupo'}|${name}`;
}

/**
 * Grupo igual à Linha (Tipo Spica preenche os dois): não há cabeçalho de grupo,
 * logo a chave `group:` desse produto nunca conta como recolhida.
 */
export function isGroupSameAsLine(
  product: Pick<ProductRow, 'productType' | 'productSubtype'>,
): boolean {
  return !!(product.productType && product.productSubtype) && product.productType === product.productSubtype;
}

/** Chave de grupo no Set collapsedGroups conforme o sort ativo. */
export function productGroupKey(product: ProductRow, sortBy: SortField): string {
  switch (sortBy) {
    case 'supplier':
      return product.lastSupplierName || 'Sem fabricante';
    case 'productType':
      return `group:${product.productType || 'Sem linha'}|${product.productSubtype || 'Sem grupo'}`;
    case 'ncm':
      return product.ncm ? `${product.ncm.slice(0, 4)}.xx.xx` : 'Sem NCM';
    case 'anvisa':
      return product.anvisa ? 'Com ANVISA' : 'Sem ANVISA';
    case 'lastIssueDate': {
      if (!product.lastIssueDate) return 'Sem data';
      const d = new Date(product.lastIssueDate);
      // ui-ok: mês por extenso e ano, formato único de cabeçalho de grupo
      return `${d.toLocaleString('pt-BR', { month: 'long' })} / ${d.getFullYear()}`;
    }
    case 'description':
      return (product.description?.[0] || '#').toUpperCase();
    case 'code':
      return product.code ? product.code[0].toUpperCase() : '#';
    case 'codigo':
      return '';
    default:
      return '';
  }
}

export function isProductRowVisible(
  product: ProductRow,
  sortBy: SortField,
  collapsed: ReadonlySet<string>,
): boolean {
  if (sortBy === 'productType') {
    if (collapsed.has(productLineKey(product))) return false;
    if (!isGroupSameAsLine(product) && collapsed.has(productGroupKey(product, sortBy))) return false;
    const sub = productSubgroupKey(product);
    if (sub && collapsed.has(sub)) return false;
    return true;
  }
  const g = productGroupKey(product, sortBy);
  return !g || !collapsed.has(g);
}

export function anyProductRowVisible(
  products: ProductRow[],
  sortBy: SortField,
  collapsed: ReadonlySet<string>,
): boolean {
  return products.some((p) => isProductRowVisible(p, sortBy, collapsed));
}

/**
 * Todas as chaves de linha/grupo/subgrupo do conjunto — carregar sempre recolhido
 * e botão "Recolher" fecha tudo.
 */
export function allCollapseKeys(
  products: ProductRow[],
  sortBy: SortField,
): Set<string> {
  const keys = new Set<string>();
  if (sortBy === 'productType') {
    for (const p of products) {
      keys.add(productLineKey(p));
      const sub = productSubgroupKey(p);
      if (sub) keys.add(sub);
    }
  }
  for (const p of products) {
    const g = productGroupKey(p, sortBy);
    if (g) keys.add(g);
  }
  return keys;
}

/** Botão Recolher = fechar todas as linhas, grupos e subgrupos. */
export function safeCollapseKeys(
  products: ProductRow[],
  sortBy: SortField,
): Set<string> {
  return allCollapseKeys(products, sortBy);
}

/**
 * Chaves do último nível de agrupamento de cada produto (subgrupo; sem subgrupo,
 * o grupo; grupo == linha, a linha). Com essas chaves recolhidas nenhum produto
 * renderiza, mas toda a estrutura acima fica visível.
 */
export function leafCollapseKeys(products: ProductRow[]): Set<string> {
  const keys = new Set<string>();
  for (const p of products) {
    const sub = productSubgroupKey(p);
    if (sub) keys.add(sub);
    else if (!isGroupSameAsLine(p)) keys.add(productGroupKey(p, 'productType'));
    else keys.add(productLineKey(p));
  }
  return keys;
}

/**
 * Botão "Expandir" e busca ativa: abre tudo quando o conjunto é pequeno; acima
 * de FULL_EXPAND_LIMIT abre só até o último nível de agrupamento (produtos ao
 * clicar nele).
 */
export function expandCollapseKeys(
  products: ProductRow[],
  sortBy: SortField,
): Set<string> {
  if (sortBy !== 'productType' || products.length <= FULL_EXPAND_LIMIT) return new Set();
  return leafCollapseKeys(products);
}
