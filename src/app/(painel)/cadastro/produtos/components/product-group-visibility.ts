import type { ProductRow, SortField } from '../types';

/** Chave de linha no Set collapsedGroups (hierarquia productType). */
export function productLineKey(product: Pick<ProductRow, 'productType'>): string {
  return `line:${product.productType || 'Sem linha'}`;
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
      return `${d.toLocaleString('pt-BR', { month: 'long' })} / ${d.getFullYear()}`;
    }
    case 'description':
      return (product.description?.[0] || '#').toUpperCase();
    case 'code':
      return product.code ? product.code[0].toUpperCase() : '#';
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
    return !collapsed.has(productLineKey(product)) && !collapsed.has(productGroupKey(product, sortBy));
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
 * Se o Set de colapso esconderia TODOS os itens da página, devolve Set vazio.
 * Impede a tela em branco (só cabeçalho + "Clique para expandir").
 */
export function effectiveCollapsedGroups(
  products: ProductRow[],
  sortBy: SortField,
  collapsed: ReadonlySet<string>,
): Set<string> {
  if (collapsed.size === 0 || products.length === 0) {
    return collapsed instanceof Set ? collapsed : new Set(collapsed);
  }
  if (anyProductRowVisible(products, sortBy, collapsed)) {
    return collapsed instanceof Set ? collapsed : new Set(collapsed);
  }
  return new Set();
}

/**
 * Chaves seguras para "Recolher": nunca deixar a página sem nenhuma linha de produto.
 */
export function safeCollapseKeys(
  products: ProductRow[],
  sortBy: SortField,
): Set<string> {
  const lines = sortBy === 'productType'
    ? Array.from(new Set(products.map(productLineKey)))
    : [];
  const groups = Array.from(new Set(products.map((p) => productGroupKey(p, sortBy)).filter(Boolean)));

  let candidate: Set<string>;
  if (sortBy === 'productType') {
    candidate = lines.length <= 1
      ? new Set(groups)
      : new Set([...lines, ...groups]);
  } else {
    candidate = new Set(groups);
  }

  if (!anyProductRowVisible(products, sortBy, candidate)) {
    return new Set();
  }
  return candidate;
}
