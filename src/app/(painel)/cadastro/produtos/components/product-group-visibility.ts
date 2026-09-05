import type { ProductRow, SortField } from '../types';

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
    if (collapsed.has(productGroupKey(product, sortBy))) return false;
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
 * Todas as chaves de linha/grupo/subgrupo da página — carregar sempre recolhido
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
