/**
 * operator-sort.ts — Ordenação canônica de ofícios e autorizações de operadoras de saúde.
 *
 * Aplica a regra de negócio estável:
 *   1. Decrescente por data de emissão (issuedAt), com datas nulas ao final
 *   2. Desempate decrescente por número de ofício (oficioNumber) com ordenação numérica natural
 *
 * Unifica a lógica duplicada em cassems/access.ts e impcg/access.ts.
 */

export interface SortableOperatorItem {
  issuedAt: Date | string | null;
  oficioNumber: string;
}

export function sortOperatorListItems<T extends SortableOperatorItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const at = a.issuedAt ? new Date(a.issuedAt).getTime() : 0;
    const bt = b.issuedAt ? new Date(b.issuedAt).getTime() : 0;
    if (bt !== at) return bt - at;
    return b.oficioNumber.localeCompare(a.oficioNumber, undefined, { numeric: true });
  });
}
