import type { ProductRow } from '../types';
import {
  isGroupSameAsLine,
  productGroupKey,
  productLineKey,
  productSubgroupKey,
} from './product-group-visibility';

export interface ProductSubgroupNode {
  key: string;
  name: string;
  products: ProductRow[];
}

export interface ProductGroupNode {
  key: string;
  name: string;
  /** Grupo == Linha (Tipo Spica nos dois): sem cabeçalho âmbar, nunca recolhido. */
  sameAsLine: boolean;
  subgroups: ProductSubgroupNode[];
  /** Produtos do grupo sem subgrupo (renderizados direto sob o grupo). */
  loose: ProductRow[];
  /** Todos os produtos do grupo (checkbox de seleção do cabeçalho). */
  products: ProductRow[];
}

export interface ProductLineNode {
  key: string;
  name: string;
  groups: ProductGroupNode[];
  products: ProductRow[];
}

/**
 * Monta a árvore Linha > Grupo > Subgrupo > Produto preservando a ordem em que
 * o servidor devolveu os produtos. O catálogo inteiro (~8k) chega de uma vez na
 * hierarquia; a tabela renderiza só os filhos de nós expandidos, então a árvore
 * precisa existir uma vez (useMemo) e não ser recalculada por toggle.
 */
export function buildProductTree(products: ProductRow[]): ProductLineNode[] {
  const lines = new Map<string, ProductLineNode>();
  const groups = new Map<string, ProductGroupNode>();
  const subgroups = new Map<string, ProductSubgroupNode>();

  for (const product of products) {
    const lineKey = productLineKey(product);
    let line = lines.get(lineKey);
    if (!line) {
      line = { key: lineKey, name: product.productType || 'Sem linha', groups: [], products: [] };
      lines.set(lineKey, line);
    }
    line.products.push(product);

    const groupKey = productGroupKey(product, 'productType');
    let group = groups.get(groupKey);
    if (!group) {
      group = {
        key: groupKey,
        name: product.productSubtype || 'Sem grupo',
        sameAsLine: isGroupSameAsLine(product),
        subgroups: [],
        loose: [],
        products: [],
      };
      groups.set(groupKey, group);
      line.groups.push(group);
    }
    group.products.push(product);

    const subKey = productSubgroupKey(product);
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

/** Chaves dos produtos cujas linhas estão visíveis (linha, grupo e subgrupo abertos). */
export function visibleTreeProductKeys(
  tree: ProductLineNode[],
  collapsed: ReadonlySet<string>,
): string[] {
  const keys: string[] = [];
  for (const line of tree) {
    if (collapsed.has(line.key)) continue;
    for (const group of line.groups) {
      if (!group.sameAsLine && collapsed.has(group.key)) continue;
      for (const sub of group.subgroups) {
        if (collapsed.has(sub.key)) continue;
        for (const p of sub.products) keys.push(p.key);
      }
      for (const p of group.loose) keys.push(p.key);
    }
  }
  return keys;
}
